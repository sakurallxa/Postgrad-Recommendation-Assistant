import { Controller, Get, Post, Headers, UnauthorizedException, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { DeptDailySpiderScheduler } from './dept-daily-spider.scheduler';

/**
 * 运维管理端点：
 *  - 走 X-Crawler-Ingest-Key 而非 JWT（admin 操作，独立于用户登录）
 *  - 单独 controller 而不挂在 CrawlJobController 上，避免跟 JWT-only 路由混
 */
@ApiTags('运维：抓取健康')
@Controller('crawl-admin')
export class CrawlAdminController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly deptDailyScheduler?: DeptDailySpiderScheduler,
  ) {}

  private requireKey(ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
  }

  /**
   * GET /api/v1/crawl-admin/spider-health
   * 一次性看清:有多少 dept 可爬、最近 24h 抓过几个、status=error 有哪些
   */
  @Get('spider-health')
  @ApiOperation({ summary: 'spider/dept 健康状况快照' })
  @ApiHeader({ name: 'X-Crawler-Ingest-Key', required: true })
  async spiderHealth(@Headers('x-crawler-ingest-key') ingestKey: string) {
    this.requireKey(ingestKey);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

    // 1) dept 覆盖率
    const totalActive = await this.prisma.department.count({ where: { active: true } });
    const hasNoticeUrl = await this.prisma.department.count({
      where: { active: true, noticeUrl: { not: null } },
    });
    const noNoticeUrl = totalActive - hasNoticeUrl;

    // 2) 缓存状态分布
    const cacheGroups = await this.prisma.departmentCrawlCache.groupBy({
      by: ['status'],
      _count: { departmentId: true },
    });
    const cacheStats: Record<string, number> = {};
    for (const g of cacheGroups) cacheStats[g.status] = g._count.departmentId;

    // 3) 最近 24h 跑过抓取的 dept 数
    const crawledLast24h = await this.prisma.departmentCrawlCache.count({
      where: { lastCrawledAt: { gte: yesterday } },
    });

    // 4) status=error 的 dept(前 20 个,带详情)
    const errorDepts = await this.prisma.departmentCrawlCache.findMany({
      where: { status: 'error' },
      take: 20,
      orderBy: { lastCrawledAt: 'desc' },
      select: { departmentId: true, lastCrawledAt: true },
    });
    const errorDeptIds = errorDepts.map((d) => d.departmentId);
    const errorDeptInfo = errorDeptIds.length
      ? await this.prisma.department.findMany({
          where: { id: { in: errorDeptIds } },
          select: { id: true, name: true, noticeUrl: true, universityId: true },
        })
      : [];
    const uniMap = new Map<string, string>();
    if (errorDeptInfo.length) {
      const unis = await this.prisma.university.findMany({
        where: { id: { in: errorDeptInfo.map((d) => d.universityId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      });
      for (const u of unis) uniMap.set(u.id, u.name);
    }
    const errorList = errorDepts.map((c) => {
      const d = errorDeptInfo.find((x) => x.id === c.departmentId);
      return {
        deptId: c.departmentId,
        uni: d?.universityId ? uniMap.get(d.universityId) : null,
        dept: d?.name,
        noticeUrl: d?.noticeUrl,
        lastCrawledAt: c.lastCrawledAt,
      };
    });

    // 5) 镜像同步健康(最近 1 条 baoyantongzhi 来源的 camp)
    const mostRecentMirror = await this.prisma.campInfo.findFirst({
      where: { sourceUrl: { contains: 'baoyantongzhi.com' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    // 6) 最近 24h 创建的 camps(看数据新鲜度)
    const campsLast24h = await this.prisma.campInfo.count({
      where: { createdAt: { gte: yesterday } },
    });

    return {
      deptCoverage: {
        totalActive,
        hasNoticeUrl,
        noNoticeUrl,
        noticeUrlCoverage: totalActive > 0 ? Math.round((hasNoticeUrl / totalActive) * 100) : 0,
      },
      cacheStats,
      crawledLast24h,
      campsLast24h,
      mostRecentMirrorCamp: mostRecentMirror?.createdAt || null,
      mirrorStaleMinutes: mostRecentMirror
        ? Math.round((now.getTime() - mostRecentMirror.createdAt.getTime()) / 60000)
        : null,
      errorDepts: errorList,
      deptDailyEnabled: process.env.DEPT_DAILY_CRAWL_ENABLED === 'true',
      mirrorEnabled: process.env.BAOYANTONGZHI_MIRROR_ENABLED !== 'false',
    };
  }

  /**
   * POST /api/v1/crawl-admin/dept-daily-spider/run
   * 手动触发一次"全部 noticeUrl dept 的抓取"(平时由每天 03:00 cron 自动触发)
   */
  @Post('dept-daily-spider/run')
  @ApiOperation({ summary: '手动触发每日 dept spider(平时 03:00 cron 自动)' })
  @ApiHeader({ name: 'X-Crawler-Ingest-Key', required: true })
  async runDeptDailySpider(@Headers('x-crawler-ingest-key') ingestKey: string) {
    this.requireKey(ingestKey);
    if (!this.deptDailyScheduler) {
      throw new UnauthorizedException('DeptDailySpiderScheduler 未启用(test 环境)');
    }
    return this.deptDailyScheduler.runManual();
  }
}
