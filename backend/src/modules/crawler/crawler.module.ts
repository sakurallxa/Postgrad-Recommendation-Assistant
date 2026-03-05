import { Module } from '@nestjs/common';
import { CrawlerController } from './crawler.controller';
import { CrawlerService } from './crawler.service';
import { ProgressModule } from '../progress/progress.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [ProgressModule, CommonModule],
  controllers: [CrawlerController],
  providers: [CrawlerService],
  exports: [CrawlerService],
})
export class CrawlerModule {}
