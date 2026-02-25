import { Controller, Post, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CrawlerService } from './crawler.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('爬虫')
@Controller('crawler')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Post('trigger')
  @ApiOperation({ summary: '手动触发爬虫', description: '触发爬虫任务，支持全量爬取或指定院校' })
  @ApiQuery({ name: 'universityId', required: false, description: '指定院校ID' })
  @ApiQuery({ name: 'priority', required: false, description: '优先级筛选 (P0/P1/P2/P3)' })
  async trigger(
    @Query('universityId') universityId?: string,
    @Query('priority') priority?: string,
  ) {
    return this.crawlerService.trigger(universityId, priority);
  }

  @Get('logs')
  @ApiOperation({ summary: '获取爬虫日志' })
  async getLogs() {
    return this.crawlerService.getLogs();
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: '获取任务状态', description: '查询指定爬虫任务的执行状态' })
  async getTaskStatus(@Param('taskId') taskId: string) {
    return this.crawlerService.getTaskStatus(taskId);
  }
}
