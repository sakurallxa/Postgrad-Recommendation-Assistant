import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlJobService } from './crawl-job.service';

/**
 * 每天 06:00 / 20:00 自动跑一次自爬，覆盖所有"当前有用户订阅"的院系。
 *
 * 设计原则：
 *  - 仅跑被订阅的 dept（去重），无人订阅的 dept 不浪费 LLM
 *  - 用一个虚拟 systemUserId 创建 CrawlJob（triggerType='system_cron'），不计入用户限频
 *  - 单批最多 50 个 dept，超出拆批跑（避免一个 job 跑太久）
 */
@Injectable()
export class AutoCrawlScheduler {
  private readonly logger = new Logger(AutoCrawlScheduler.name);
  private readonly SYSTEM_USER_ID = 'system-auto-crawl';
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawlJobService: CrawlJobService,
  ) {}

  // 早上 06:00（用户起床前抓好）+ 晚上 20:00（用户晚上看新机会）
  @Cron('0 0 6,20 * * *')
  async runScheduledCrawl() {
    if (process.env.AUTO_CRAWL_ENABLED === 'false') {
      this.logger.log('AUTO_CRAWL_ENABLED=false, 跳过');
      return;
    }
    const startedAt = Date.now();
    this.logger.log('[auto-crawl] 开始扫描订阅...');

    // 1) 拉所有 active 订阅，去重 deptId
    const subs = await this.prisma.userDepartmentSubscription.findMany({
      where: { active: true },
      select: { departmentId: true },
      distinct: ['departmentId'],
    });
    const deptIds = Array.from(new Set(subs.map((s) => s.departmentId).filter(Boolean)));
    this.logger.log(`[auto-crawl] 找到 ${deptIds.length} 个被订阅的 dept（去重后）`);

    if (deptIds.length === 0) {
      this.logger.log('[auto-crawl] 无订阅，跳过');
      return;
    }

    // 2) 确保 system 用户存在（用 fixed id 占位，无 openid）
    await this.ensureSystemUser();

    // 3) 分批创建 system_cron 作业
    let created = 0;
    for (let i = 0; i < deptIds.length; i += this.BATCH_SIZE) {
      const batch = deptIds.slice(i, i + this.BATCH_SIZE);
      try {
        const job = await this.crawlJobService.createJob(this.SYSTEM_USER_ID, {
          departmentIds: batch,
          triggerType: 'system_cron',
        } as any);
        created++;
        this.logger.log(
          `[auto-crawl] 批次 ${i / this.BATCH_SIZE + 1}: ${batch.length} dept → job=${job.jobId}`,
        );
      } catch (e: any) {
        this.logger.error(`[auto-crawl] 批次 ${i / this.BATCH_SIZE + 1} 失败: ${e?.message}`);
      }
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    this.logger.log(`[auto-crawl] 调度完成: ${created} 个 job 已入队，用时 ${elapsed}s`);
  }

  /** 确保 system-auto-crawl 这个虚拟用户存在 */
  private async ensureSystemUser() {
    const existing = await this.prisma.user.findUnique({
      where: { id: this.SYSTEM_USER_ID },
    });
    if (existing) return;
    try {
      await this.prisma.user.create({
        data: {
          id: this.SYSTEM_USER_ID,
          openidHash: 'system-cron-placeholder',
          openidCipher: 'system-cron-placeholder',
        } as any,
      });
      this.logger.log(`[auto-crawl] 创建虚拟用户 ${this.SYSTEM_USER_ID}`);
    } catch (e: any) {
      // 并发场景下可能 race，忽略 unique 冲突
      this.logger.debug(`[auto-crawl] system user 创建失败（可能已存在）: ${e?.message}`);
    }
  }

  /** 管理员手动触发（测试用） */
  async triggerNow(): Promise<{ scheduled: number; depts: number }> {
    const subs = await this.prisma.userDepartmentSubscription.findMany({
      where: { active: true },
      select: { departmentId: true },
      distinct: ['departmentId'],
    });
    const deptIds = Array.from(new Set(subs.map((s) => s.departmentId).filter(Boolean)));
    if (deptIds.length === 0) return { scheduled: 0, depts: 0 };
    await this.ensureSystemUser();
    let created = 0;
    for (let i = 0; i < deptIds.length; i += this.BATCH_SIZE) {
      const batch = deptIds.slice(i, i + this.BATCH_SIZE);
      await this.crawlJobService
        .createJob(this.SYSTEM_USER_ID, {
          departmentIds: batch,
          triggerType: 'system_cron',
        } as any)
        .then(() => (created++))
        .catch(() => null);
    }
    return { scheduled: created, depts: deptIds.length };
  }
}
