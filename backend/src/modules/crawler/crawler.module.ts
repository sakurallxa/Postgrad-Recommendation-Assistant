import { Module } from '@nestjs/common';
import { CrawlerController } from './crawler.controller';
import { InternalDepartmentController } from './internal-department.controller';
import { CrawlerService } from './crawler.service';
import { CrawlerScheduler } from './crawler.scheduler';
import { ProgressModule } from '../progress/progress.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [ProgressModule, CommonModule],
  controllers: [CrawlerController, InternalDepartmentController],
  providers: [
    CrawlerService,
    // 生产环境启用定时重抓；测试环境通过 NODE_ENV=test 跳过（ScheduleModule 已在 app.module 中条件加载）
    ...(process.env.NODE_ENV === 'test' ? [] : [CrawlerScheduler]),
  ],
  exports: [CrawlerService],
})
export class CrawlerModule {}
