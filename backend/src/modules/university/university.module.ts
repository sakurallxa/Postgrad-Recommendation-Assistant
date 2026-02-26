import { Module } from '@nestjs/common';
import { UniversityController } from './university.controller';
import { UniversityService } from './university.service';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [UniversityController],
  providers: [UniversityService],
  exports: [UniversityService],
})
export class UniversityModule {}
