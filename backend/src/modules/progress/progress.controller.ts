import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProgressService } from './progress.service';
import { CreateProgressDto } from './dto/create-progress.dto';
import { UpdateProgressStatusDto } from './dto/update-progress-status.dto';
import { UpdateProgressSubscriptionDto } from './dto/update-progress-subscription.dto';
import { CreateProgressEventDto } from './dto/create-progress-event.dto';
import { SnoozeProgressAlertDto } from './dto/snooze-progress-alert.dto';

@ApiTags('申请进展')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  @ApiOperation({ summary: '获取我的申请进展列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.progressService.findAll(userId, page, limit, status);
  }

  @Post()
  @ApiOperation({ summary: '创建申请进展' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateProgressDto) {
    return this.progressService.create(userId, dto);
  }

  @Get('alerts')
  @ApiOperation({ summary: '获取申请进展提醒列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async listAlerts(
    @CurrentUser('sub') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.progressService.listAlerts(userId, page, limit, status);
  }

  @Patch('alerts/:alertId/handle')
  @ApiOperation({ summary: '标记提醒为已处理' })
  async handleAlert(
    @CurrentUser('sub') userId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.progressService.handleAlert(userId, alertId);
  }

  @Patch('alerts/:alertId/snooze')
  @ApiOperation({ summary: '延后提醒' })
  async snoozeAlert(
    @CurrentUser('sub') userId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: SnoozeProgressAlertDto,
  ) {
    return this.progressService.snoozeAlert(userId, alertId, dto.hours);
  }

  @Post('events')
  @ApiOperation({ summary: '创建变更事件并按订阅分发提醒' })
  async createEvent(@Body() dto: CreateProgressEventDto) {
    return this.progressService.createChangeEvent(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取申请进展详情' })
  async findOne(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) progressId: string,
  ) {
    return this.progressService.findOne(userId, progressId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新申请进展状态' })
  async updateStatus(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) progressId: string,
    @Body() dto: UpdateProgressStatusDto,
  ) {
    return this.progressService.updateStatus(userId, progressId, dto);
  }

  @Get(':id/subscription')
  @ApiOperation({ summary: '获取进展订阅设置' })
  async getSubscription(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) progressId: string,
  ) {
    return this.progressService.getSubscription(userId, progressId);
  }

  @Patch(':id/subscription')
  @ApiOperation({ summary: '更新进展订阅设置' })
  async updateSubscription(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) progressId: string,
    @Body() dto: UpdateProgressSubscriptionDto,
  ) {
    return this.progressService.updateSubscription(userId, progressId, dto);
  }
}
