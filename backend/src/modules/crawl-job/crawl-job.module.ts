import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrawlJobController } from './crawl-job.controller';
import { CrawlAdminController } from './crawl-admin.controller';
import { CrawlJobService } from './crawl-job.service';
import { CrawlQueueService } from './crawl-queue.service';
import { AutoCrawlScheduler } from './auto-crawl-scheduler';
import { DeptDailySpiderScheduler } from './dept-daily-spider.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [CrawlJobController, CrawlAdminController],
  providers: [
    CrawlJobService,
    CrawlQueueService,
    // 生产环境启用：
    //  - AutoCrawlScheduler: 06:00 / 20:00 跑"被订阅"的 dept
    //  - DeptDailySpiderScheduler: 03:00 跑"全部有 noticeUrl"的 dept（提前准备新用户数据）
    //  测试环境跳过两者避免副作用
    ...(process.env.NODE_ENV === 'test' ? [] : [AutoCrawlScheduler, DeptDailySpiderScheduler]),
  ],
  exports: [CrawlJobService],
})
export class CrawlJobModule {}
