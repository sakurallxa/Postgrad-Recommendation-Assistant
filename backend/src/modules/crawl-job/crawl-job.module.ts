import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrawlJobController } from './crawl-job.controller';
import { CrawlJobService } from './crawl-job.service';
import { CrawlQueueService } from './crawl-queue.service';
import { AutoCrawlScheduler } from './auto-crawl-scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [CrawlJobController],
  providers: [
    CrawlJobService,
    CrawlQueueService,
    // 生产环境启用每日 06:00 / 20:00 自动抓取；测试环境跳过
    ...(process.env.NODE_ENV === 'test' ? [] : [AutoCrawlScheduler]),
  ],
  exports: [CrawlJobService],
})
export class CrawlJobModule {}
