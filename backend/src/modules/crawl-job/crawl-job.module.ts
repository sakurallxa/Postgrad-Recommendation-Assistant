import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrawlJobController } from './crawl-job.controller';
import { CrawlJobService } from './crawl-job.service';
import { CrawlQueueService } from './crawl-queue.service';

@Module({
  imports: [PrismaModule],
  controllers: [CrawlJobController],
  providers: [CrawlJobService, CrawlQueueService],
  exports: [CrawlJobService],
})
export class CrawlJobModule {}
