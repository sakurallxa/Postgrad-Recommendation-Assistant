import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// 缓存 TTL 按状态分层：
//   - ok（找到公告）：24 小时（公告新增不频繁，1 天内不必重抓）
//   - empty（没找到）：2 小时（学院可能临时没更新，太长会让"重选订阅"立刻命中缓存看不到新数据）
//   - error（抓取失败）：30 分钟（快速重试）
const CACHE_TTL_OK_HOURS = 24;
const CACHE_TTL_EMPTY_HOURS = 2;
const CACHE_TTL_ERROR_HOURS = 0.5;
const JOB_TIMEOUT_MS = 25 * 60 * 1000; // 单 job 最长跑 25 分钟

/**
 * 进程内作业队列：spawn scrapy 子进程跑按需抓取。
 *
 * 流程：
 * 1. 收到 enqueue(jobId) → 读 scope → 调缓存
 * 2. 未命中缓存的 dept_ids → spawn `python -m scrapy crawl university -a dept_ids=... -a job_id=...`
 * 3. 子进程跑完（或超时） → 查 DB 拿这次新建/更新的 CampInfo（按 departmentId 过滤）
 * 4. 对每个抓到的 camp 跑 AI 匹配 → 写 CampMatchResult
 * 5. 更新 job 状态 + 写 DepartmentCrawlCache
 *
 * 重启恢复：扫表 status IN ('queued','running') 重新入队。
 */
@Injectable()
export class CrawlQueueService implements OnModuleInit {
  private readonly logger = new Logger(CrawlQueueService.name);
  private readonly running = new Set<string>();
  private readonly maxConcurrent = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.prisma.crawlJob.updateMany({
      where: { status: 'running' },
      data: { status: 'queued', errorMsg: '后端重启，重新入队' },
    });
    const pending = await this.prisma.crawlJob.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (pending.length) {
      this.logger.log(`[启动恢复] 待执行 job: ${pending.length}`);
      for (const j of pending) this.dispatch(j.id);
    }
  }

  enqueue(jobId: string) {
    this.dispatch(jobId);
  }

  private dispatch(jobId: string) {
    if (this.running.size >= this.maxConcurrent) {
      setTimeout(() => this.dispatch(jobId), 5000);
      return;
    }
    if (this.running.has(jobId)) return;
    this.running.add(jobId);
    this.runJob(jobId)
      .catch((err) => this.logger.error(`[job ${jobId}] 失败: ${err?.message}`, err?.stack))
      .finally(() => this.running.delete(jobId));
  }

  private async runJob(jobId: string) {
    const job = await this.prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (job.status === 'completed') return;

    const startedAt = new Date();
    await this.prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt },
    });

    const scope = JSON.parse(job.scopeJson) as Array<{
      departmentId: string;
      schoolSlug: string;
      universityName: string;
      departmentName: string;
      universityId?: string;
    }>;

    const empty: Array<{ departmentId: string; departmentName: string; universityName: string; reason: string }> = [];
    const now = new Date();

    // 1) 分流：缓存命中 vs 需要真实抓取
    const toCrawl: typeof scope = [];
    let cachedCampsFound = 0;
    for (const item of scope) {
      const cached = await this.prisma.departmentCrawlCache.findUnique({
        where: { departmentId: item.departmentId },
      });
      if (cached && cached.ttlExpiresAt > now) {
        this.logger.log(
          `[job ${jobId}] 缓存命中 ${item.universityName}/${item.departmentName} (${cached.campsFoundLast}条)`,
        );
        cachedCampsFound += cached.campsFoundLast;
        if (cached.campsFoundLast === 0) {
          empty.push({
            departmentId: item.departmentId,
            departmentName: item.departmentName,
            universityName: item.universityName,
            reason: cached.status === 'error' ? 'crawl_error' : 'no_recent_announcements',
          });
        }
      } else {
        toCrawl.push(item);
      }
    }

    let realCampsFound = 0;
    let crawlFailed = false;

    if (toCrawl.length > 0) {
      // 2) spawn scrapy 子进程
      const deptIds = toCrawl.map((x) => x.departmentId).join(',');
      try {
        const exitCode = await this.spawnScrapy(jobId, deptIds);
        if (exitCode !== 0) {
          this.logger.warn(`[job ${jobId}] spider 退出码非 0: ${exitCode}`);
        }
      } catch (err: any) {
        this.logger.error(`[job ${jobId}] spider 异常: ${err?.message}`);
        crawlFailed = true;
      }

      // 3) 查 DB 拿这次抓到的新公告（按 departmentId + createdAt >= startedAt）
      for (const item of toCrawl) {
        const newCamps = await this.prisma.campInfo.findMany({
          where: {
            departmentId: item.departmentId,
            OR: [
              { createdAt: { gte: startedAt } },
              { updatedAt: { gte: startedAt } },
            ],
          },
        });
        if (newCamps.length === 0) {
          empty.push({
            departmentId: item.departmentId,
            departmentName: item.departmentName,
            universityName: item.universityName,
            reason: crawlFailed ? 'crawl_error' : 'no_recent_announcements',
          });
        } else {
          realCampsFound += newCamps.length;
          // 4) 触发 AI 匹配（异步，不阻塞 job 完成）
          this.matchService.scheduleMatching(item.departmentId, newCamps.map((c) => c.id)).catch((e) =>
            this.logger.error(`[job ${jobId}] 匹配调度失败: ${e?.message}`),
          );
        }
        // 5) 写缓存
        await this.upsertDeptCache(item.departmentId, newCamps.length, crawlFailed);
      }
    }

    const totalFound = cachedCampsFound + realCampsFound;
    await this.prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: crawlFailed ? 'partial' : 'completed',
        finishedAt: new Date(),
        completedTargets: scope.length,
        campsFound: totalFound,
        emptyTargetsJson: JSON.stringify(empty),
        errorMsg: crawlFailed ? 'spider 部分失败，已抓到的公告已入库' : null,
      },
    });
    this.logger.log(
      `[job ${jobId}] 完成: ${totalFound} 条 (cached=${cachedCampsFound} real=${realCampsFound}) empty=${empty.length}`,
    );
  }

  private async upsertDeptCache(deptId: string, count: number, crawlFailed: boolean) {
    const now = new Date();
    const status = crawlFailed ? 'error' : count > 0 ? 'ok' : 'empty';
    // 不同状态用不同 TTL（详见模块顶部常量注释）
    const ttlHours =
      status === 'ok'
        ? CACHE_TTL_OK_HOURS
        : status === 'empty'
          ? CACHE_TTL_EMPTY_HOURS
          : CACHE_TTL_ERROR_HOURS;
    const ttl = new Date(now.getTime() + ttlHours * 3600 * 1000);
    await this.prisma.departmentCrawlCache.upsert({
      where: { departmentId: deptId },
      create: { departmentId: deptId, lastCrawledAt: now, campsFoundLast: count, status, ttlExpiresAt: ttl },
      update: { lastCrawledAt: now, campsFoundLast: count, status, ttlExpiresAt: ttl },
    });
  }

  /**
   * spawn scrapy 子进程，等待退出码。
   * 路径推断：
   *   - 优先 CRAWLER_DIR 环境变量
   *   - 否则 <project-root>/crawler
   *   - Windows 用 python.exe；Linux/macOS 用 python3
   */
  private spawnScrapy(jobId: string, deptIds: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const crawlerDir =
        this.configService.get<string>('CRAWLER_DIR') ||
        path.resolve(__dirname, '..', '..', '..', '..', 'crawler');

      if (!fs.existsSync(crawlerDir)) {
        return reject(new Error(`crawler 目录不存在: ${crawlerDir}`));
      }

      const isWindows = process.platform === 'win32';
      const pythonCmd =
        this.configService.get<string>('PYTHON_CMD') ||
        (isWindows ? 'python.exe' : 'python3');

      // 用 -m scrapy 而非 scrapy 命令，避免 PATH 依赖
      const args = [
        '-m',
        'scrapy',
        'crawl',
        'university',
        '-a',
        `dept_ids=${deptIds}`,
        '-a',
        `job_id=${jobId}`,
        '-s',
        'LOG_LEVEL=WARNING',
      ];

      this.logger.log(`[job ${jobId}] spawn: ${pythonCmd} ${args.join(' ')} (cwd=${crawlerDir})`);

      const proc = spawn(pythonCmd, args, {
        cwd: crawlerDir,
        env: {
          ...process.env,
          CRAWLER_BACKEND_BASE_URL: 'http://127.0.0.1:3000',
          INTERNAL_API_TOKEN: this.configService.get<string>('INTERNAL_API_TOKEN') || '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        this.logger.warn(`[job ${jobId}] spider 超过 ${JOB_TIMEOUT_MS}ms，强制 kill`);
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 5000);
      }, JOB_TIMEOUT_MS);

      proc.stdout?.on('data', (data) => {
        const txt = data.toString().trim();
        if (txt) this.logger.debug(`[job ${jobId}/spider] ${txt.slice(0, 300)}`);
      });
      proc.stderr?.on('data', (data) => {
        const txt = data.toString().trim();
        if (txt) this.logger.warn(`[job ${jobId}/spider] ${txt.slice(0, 300)}`);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });
  }

  // 接 MatchSchedulerService（P1d）
  private get matchService(): { scheduleMatching: (deptId: string, campIds: string[]) => Promise<void> } {
    return require('./match-scheduler').MatchSchedulerSingleton(this.prisma, this.configService, this.logger);
  }
}
