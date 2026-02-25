import { Controller, Get, Post, Delete, Body, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';

@ApiTags('提醒')
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get()
  @ApiOperation({ summary: '获取提醒列表' })
  @ApiQuery({ name: 'page', required: false, description: '页码', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: '每页数量', type: Number })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.reminderService.findAll(page, limit);
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
