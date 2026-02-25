import { Module } from '@nestjs/common';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { ReminderScheduler } from './reminder.scheduler';

@Module({
  controllers: [ReminderController],
  providers: [ReminderService, ReminderScheduler],
  exports: [ReminderService],
})
export class ReminderModule {}
