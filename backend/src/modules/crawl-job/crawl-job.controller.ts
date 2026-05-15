import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CrawlJobService } from './crawl-job.service';
import { CreateCrawlJobDto } from './dto/create-crawl-job.dto';

@ApiTags('按需抓取作业')
@Controller('crawl-jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CrawlJobController {
  constructor(private readonly service: CrawlJobService) {}

  @Post()
  @ApiOperation({ summary: '创建按需抓取作业（前端在订阅保存后调用）' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateCrawlJobDto) {
    return this.service.createJob(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: '我的作业列表' })
  async listMine(@CurrentUser('sub') userId: string, @Query('limit') limit?: string) {
    return this.service.listMyJobs(userId, limit ? Math.min(50, parseInt(limit, 10) || 10) : 10);
  }

  @Get('latest')
  @ApiOperation({ summary: '我的最近一次作业（用于首页 banner 恢复显示）' })
  async latest(@CurrentUser('sub') userId: string) {
    return this.service.getMyLatestJob(userId);
  }

  @Get(':jobId')
  @ApiOperation({ summary: '查询作业进度（前端 15s 轮询）' })
  async get(@CurrentUser('sub') userId: string, @Param('jobId') jobId: string) {
    return this.service.getJob(userId, jobId);
  }

  @Get(':jobId/results')
  @ApiOperation({ summary: '取作业结果' })
  async getResults(@CurrentUser('sub') userId: string, @Param('jobId') jobId: string) {
    return this.service.getJobResults(userId, jobId);
  }

  @Post(':jobId/feedback')
  @ApiOperation({ summary: '提交"抓不到"反馈' })
  async feedback(
    @CurrentUser('sub') userId: string,
    @Param('jobId') jobId: string,
    @Body() body: { departmentId: string; issueType: string; correctUrl?: string; description?: string },
  ) {
    return this.service.submitFeedback(userId, jobId, body);
  }
}
