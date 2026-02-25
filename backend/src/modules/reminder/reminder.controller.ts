import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';

@ApiTags('提醒')
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get()
  @ApiOperation({ summary: '获取提醒列表' })
  async findAll() {
    return this.reminderService.findAll();
  }

  @Post()
  @ApiOperation({ summary: '创建提醒' })
  async create(@Body() dto: any) {
    return this.reminderService.create(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除提醒' })
  async remove(@Param('id') id: string) {
    return this.reminderService.remove(id);
  }
}
