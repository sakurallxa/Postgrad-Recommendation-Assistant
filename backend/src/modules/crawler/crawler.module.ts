import { Module } from '@nestjs/common';
import { CrawlerController } from './crawler.controller';
import { InternalDepartmentController } from './internal-department.controller';
import { CrawlerService } from './crawler.service';
import { CrawlerScheduler } from './crawler.scheduler';
import { BaoyantongzhiMirrorService } from './baoyantongzhi-mirror.service';
import { MirrorSnapshotService } from './mirror-snapshot.service';
import { ProgressModule } from '../progress/progress.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [ProgressModule, CommonModule],
  controllers: [CrawlerController, InternalDepartmentController],
  providers: [
    CrawlerService,
    // BaoyantongzhiMirrorService 在 test 模式也保留（保留 instance 给 controller 注入），
    // 但定时任务受内部 BAOYANTONGZHI_MIRROR_ENABLED 控制
    BaoyantongzhiMirrorService,
    // 生产环境启用定时重抓 + 快照
    ...(process.env.NODE_ENV === 'test' ? [] : [CrawlerScheduler, MirrorSnapshotService]),
  ],
  exports: [CrawlerService, BaoyantongzhiMirrorService],
})
export class CrawlerModule {}
