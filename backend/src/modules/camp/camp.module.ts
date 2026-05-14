import { Module } from '@nestjs/common';
import { CampController } from './camp.controller';
import { CampService } from './camp.service';
import { CampFeedbackController } from './camp-feedback.controller';
import { CampAdminController } from './camp-admin.controller';
import { CrawlerModule } from '../crawler/crawler.module';

@Module({
  imports: [CrawlerModule],
  controllers: [CampController, CampFeedbackController, CampAdminController],
  providers: [CampService],
  exports: [CampService],
})
export class CampModule {}
