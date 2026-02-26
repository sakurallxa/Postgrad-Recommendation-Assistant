import { Controller, Get, Post, Delete, Body, Param, Query, DefaultValuePipe, ParseIntPipe, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReminderDto } from './dto/create-reminder.dto';

@ApiTags('提醒')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get()
  @ApiOperation({ summary: '获取提醒列表', description: '获取当前登录用户的提醒列表，支持分页和状态筛选' })
  @ApiQuery({ name: 'page', required: false, description: '页码', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: '每页数量', type: Number })
  @ApiQuery({ name: 'status', required: false, description: '状态筛选(pending/sent/failed/expired)', type: String })
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.reminderService.findAll(userId, page, limit, status);
  }

  @Post()
  @ApiOperation({ summary: '创建提醒' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateReminderDto,
  ) {
    return this.reminderService.create(userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除提醒' })
  async remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reminderService.remove(userId, id);
  }
}
