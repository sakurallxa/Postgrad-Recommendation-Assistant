import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCrawlJobDto } from './dto/create-crawl-job.dto';
import { CrawlQueueService } from './crawl-queue.service';

// mock 阶段每学院预估秒数，真实抓取约 4-6 分钟
const ESTIMATED_SECONDS_PER_DEPT = 8;
const SLOW_WARNING_SECONDS = 20 * 60;

@Injectable()
export class CrawlJobService {
  private readonly logger = new Logger(CrawlJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: CrawlQueueService,
  ) {}

  /**
   * 根据用户选择的院系 ID 列表，创建一个抓取作业。
   * 流程：
   *  1) 解析 departmentIds → 拉 Department + University 信息构造 scopeJson
   *  2) 检查 DepartmentCrawlCache 哪些命中，前端可显示"秒返回的部分"
   *  3) 写入 CrawlJob，入队
   */
  async createJob(userId: string, dto: CreateCrawlJobDto) {
    const triggerType = dto.triggerType ?? 'initial_selection';
    if (!dto.departmentIds || dto.departmentIds.length === 0) {
      throw new BadRequestException('至少选择 1 个院系');
    }

    // 限频：用户手动触发的 trigger（不含定时任务 system_cron） → 30 分钟内最多 1 次
    // 防止用户狂点抓取按钮浪费 LLM 配额
    if (triggerType !== 'system_cron') {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const recent = await this.prisma.crawlJob.findFirst({
        where: {
          userId,
          createdAt: { gte: thirtyMinAgo },
          triggerType: { not: 'system_cron' },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true },
      });
      if (recent) {
        const waitSec = 30 * 60 - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
        const waitMin = Math.max(1, Math.ceil(waitSec / 60));
        throw new BadRequestException(
          `30 分钟内已有抓取任务，请 ${waitMin} 分钟后再试（每用户每 30 分钟限 1 次）`,
        );
      }
    }

    const depts = await this.prisma.department.findMany({
      where: { id: { in: dto.departmentIds } },
      include: { university: { select: { id: true, name: true } } },
    });
    if (depts.length === 0) throw new BadRequestException('院系 ID 全部无效');

    const scope = depts.map((d) => ({
      departmentId: d.id,
      schoolSlug: d.schoolSlug,
      universityId: d.universityId || '',
      universityName: d.university?.name || '',
      departmentName: d.name,
    }));

    const totalTargets = scope.length;
    const job = await this.prisma.crawlJob.create({
      data: {
        userId,
        triggerType,
        status: 'queued',
        scopeJson: JSON.stringify(scope),
        totalTargets,
      },
    });

    // 缓存命中预检
    const now = new Date();
    const caches = await this.prisma.departmentCrawlCache.findMany({
      where: { departmentId: { in: dto.departmentIds } },
    });
    const cacheHits = caches
      .filter((c) => c.ttlExpiresAt > now)
      .map((c) => ({ departmentId: c.departmentId, campsFoundLast: c.campsFoundLast }));

    this.queue.enqueue(job.id);
    this.logger.log(
      `[job ${job.id}] 已创建: user=${userId} 院系=${totalTargets} 缓存命中=${cacheHits.length}`,
    );

    return {
      jobId: job.id,
      status: job.status,
      totalTargets,
      estimatedSeconds: Math.max(1, (totalTargets - cacheHits.length) * ESTIMATED_SECONDS_PER_DEPT),
      cachedHits: cacheHits,
    };
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('作业不存在');
    if (job.userId !== userId) throw new ForbiddenException('无权访问此作业');

    const now = new Date();
    const elapsed = job.startedAt ? Math.floor((now.getTime() - job.startedAt.getTime()) / 1000) : 0;
    const remaining = Math.max(0, job.totalTargets - job.completedTargets) * ESTIMATED_SECONDS_PER_DEPT;
    const progressPercent =
      job.totalTargets > 0 ? Math.floor((job.completedTargets / job.totalTargets) * 100) : 0;

    return {
      jobId: job.id,
      status: job.status,
      triggerType: job.triggerType,
      totalTargets: job.totalTargets,
      completedTargets: job.completedTargets,
      campsFound: job.campsFound,
      progressPercent,
      etaSeconds: remaining,
      emptyTargets: this.parseJSON<Array<any>>(job.emptyTargetsJson, []),
      isSlowWarning: elapsed > SLOW_WARNING_SECONDS && job.status === 'running',
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      errorMsg: job.errorMsg,
    };
  }

  async getJobResults(userId: string, jobId: string) {
    const job = await this.prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('作业不存在');
    if (job.userId !== userId) throw new ForbiddenException('无权访问此作业');

    const scope = JSON.parse(job.scopeJson) as Array<{ departmentId: string }>;
    const deptIds = scope.map((s) => s.departmentId);

    const camps = await this.prisma.campInfo.findMany({
      where: {
        departmentId: { in: deptIds },
        createdAt: { gte: job.startedAt ?? job.createdAt },
      },
      include: {
        university: { select: { name: true, region: true, level: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ publishDate: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      jobId: job.id,
      status: job.status,
      campsFound: camps.length,
      camps: camps.map((c) => ({
        id: c.id,
        title: c.title,
        announcementType: c.announcementType,
        universityName: c.university.name,
        departmentId: c.departmentId,
        departmentName: c.department?.name,
        publishDate: c.publishDate,
        deadline: c.deadline,
        sourceUrl: c.sourceUrl,
      })),
      emptyTargets: this.parseJSON<Array<any>>(job.emptyTargetsJson, []),
    };
  }

  async listMyJobs(userId: string, limit = 10) {
    const jobs = await this.prisma.crawlJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return jobs.map((j) => ({
      jobId: j.id,
      status: j.status,
      triggerType: j.triggerType,
      totalTargets: j.totalTargets,
      completedTargets: j.completedTargets,
      campsFound: j.campsFound,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt,
    }));
  }

  async getMyLatestJob(userId: string) {
    const job = await this.prisma.crawlJob.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return { jobId: null };
    return this.getJob(userId, job.id);
  }

  async submitFeedback(
    userId: string,
    jobId: string,
    body: { departmentId: string; issueType: string; correctUrl?: string; description?: string },
  ) {
    const job = await this.prisma.crawlJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('作业不存在');
    if (job.userId !== userId) throw new ForbiddenException('无权访问此作业');

    const fb = await this.prisma.campFeedback.create({
      data: {
        campId: '',
        userId,
        issueType: body.issueType,
        description: JSON.stringify({
          source: 'crawl_job_empty',
          jobId,
          departmentId: body.departmentId,
          correctUrl: body.correctUrl,
          userNote: body.description,
        }),
      },
    });
    return { feedbackId: fb.id, status: 'received' };
  }

  private parseJSON<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  }
}
