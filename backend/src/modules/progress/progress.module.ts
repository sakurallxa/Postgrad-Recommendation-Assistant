import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ProgressActionController } from './progress-action.controller';

@Module({
  controllers: [ProgressController, ProgressActionController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
