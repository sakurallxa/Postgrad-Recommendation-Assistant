import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlJobService } from './crawl-job.service';

/**
 * 每天 03:00 全量扫所有"已配置 noticeUrl 的 active dept"，跑学院官网 spider。
 *
 * 设计要点:
 *  - 跟 AutoCrawlScheduler 互补:它只爬"被订阅"的 dept，但新用户加入时需要数据已经在了，
 *    所以这里我们爬"配置了 noticeUrl 的全部 dept"（约 150 个，覆盖热门 985 院系）。
 *  - 选 03:00 而非 06:00，避开 AutoCrawlScheduler(6:00/20:00) 和 Mirror cron(每 30min)。
 *  - 分批 BATCH_SIZE 个 dept 一起 enqueue，避免单 job 跑太久（spider 一次跑超过 25 分钟会被 kill）。
 *  - 复用 `system-auto-crawl` 用户和 CrawlJob 机制，避免单独的执行链路。
 *  - 关键 env: DEPT_DAILY_CRAWL_ENABLED (默认 false，保留运维控制权)。
 *
 * 为什么不直接复用 AutoCrawlScheduler:
 *  - AutoCrawl 是"按订阅触发"的语义（无人订阅 → 不爬），适合避免浪费 LLM
 *  - 本调度器是"提前准备数据"的语义（不管有无订阅，只要 dept 配了 noticeUrl 就爬），用于新用户体验
 *  - 两者目标不同，混合会让逻辑复杂；分开调度器各司其职更清楚
 */
@Injectable()
export class DeptDailySpiderScheduler {
  private readonly logger = new Logger(DeptDailySpiderScheduler.name);
  private readonly SYSTEM_USER_ID = 'system-auto-crawl';
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawlJobService: CrawlJobService,
  ) {}

  // 每天 03:00:避开 AutoCrawl(6/20) 和 Mirror(每 30 min) 高峰
  @Cron('0 0 3 * * *')
  async runDailyDeptCrawl() {
    if (process.env.DEPT_DAILY_CRAWL_ENABLED !== 'true') {
      this.logger.log('DEPT_DAILY_CRAWL_ENABLED 未启用，跳过');
      return;
    }
    await this.run('cron');
  }

  /**
   * 暴露的手动触发入口（供 admin endpoint 调用，做主动验证 / 灰度）
   */
  async runManual(): Promise<{ totalDepts: number; batches: number; jobIds: string[] }> {
    return this.run('manual');
  }

  private async run(triggerSource: 'cron' | 'manual'): Promise<{ totalDepts: number; batches: number; jobIds: string[] }> {
    const startedAt = Date.now();
    this.logger.log(`[dept-daily] 开始扫描 active dept (trigger=${triggerSource})...`);

    // 拉所有 active + 有 noticeUrl 的 dept
    const depts = await this.prisma.department.findMany({
      where: { active: true, noticeUrl: { not: null } },
      select: { id: true, name: true, noticeUrl: true },
    });
    const deptIds = depts.map((d) => d.id);
    this.logger.log(`[dept-daily] 找到 ${deptIds.length} 个 (active + noticeUrl) dept`);

    if (deptIds.length === 0) {
      return { totalDepts: 0, batches: 0, jobIds: [] };
    }

    // 确保 system 用户存在
    await this.ensureSystemUser();

    // 分批 enqueue
    const jobIds: string[] = [];
    let batches = 0;
    for (let i = 0; i < deptIds.length; i += this.BATCH_SIZE) {
      const batch = deptIds.slice(i, i + this.BATCH_SIZE);
      try {
        const result = await this.crawlJobService.createJob(this.SYSTEM_USER_ID, {
          departmentIds: batch,
          triggerType: 'system_cron',
        } as any);
        jobIds.push(result.jobId);
        batches++;
        this.logger.log(
          `[dept-daily] batch ${batches}: enqueued job=${result.jobId} (${batch.length} dept)`,
        );
      } catch (err: any) {
        this.logger.warn(`[dept-daily] batch ${batches + 1} 入队失败: ${err?.message}`);
      }
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    this.logger.log(
      `[dept-daily] 完成 enqueue: 共 ${batches} 批 / ${deptIds.length} dept, 耗时 ${elapsed}s`,
    );
    return { totalDepts: deptIds.length, batches, jobIds };
  }

  private async ensureSystemUser() {
    const exists = await this.prisma.user.findUnique({
      where: { id: this.SYSTEM_USER_ID },
      select: { id: true },
    });
    if (exists) return;
    try {
      await this.prisma.user.create({
        data: {
          id: this.SYSTEM_USER_ID,
          openid: this.SYSTEM_USER_ID,
          openidHash: this.SYSTEM_USER_ID,
          openidCipher: this.SYSTEM_USER_ID,
        },
      });
      this.logger.log(`[dept-daily] 创建 system 用户 ${this.SYSTEM_USER_ID}`);
    } catch (err: any) {
      // 并发场景下可能已被别的 cron 创建,忽略冲突
      if (!err?.message?.includes('Unique')) {
        this.logger.warn(`[dept-daily] 创建 system 用户失败: ${err?.message}`);
      }
    }
  }
}
