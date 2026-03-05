import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { CrawlerService } from './crawler.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IngestCrawlerCampsDto } from './dto/ingest-camps.dto';

@ApiTags('爬虫')
@Controller('crawler')
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Post('trigger')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '手动触发爬虫', description: '触发爬虫任务，支持全量爬取或指定院校' })
  @ApiQuery({ name: 'universityId', required: false, description: '指定院校ID' })
  @ApiQuery({ name: 'priority', required: false, description: '优先级筛选 (P0/P1/P2/P3)' })
  @ApiQuery({ name: 'yearSpan', required: false, description: '抓取近N年数据，默认3年' })
  async trigger(
    @Query('universityId') universityId?: string,
    @Query('priority') priority?: string,
    @Query('yearSpan') yearSpan?: string,
  ) {
    const parsedYearSpan = yearSpan ? Number(yearSpan) : 3;
    return this.crawlerService.trigger(
      universityId,
      priority,
      Number.isFinite(parsedYearSpan) && parsedYearSpan > 0 ? parsedYearSpan : 3,
    );
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取爬虫日志' })
  async getLogs() {
    return this.crawlerService.getLogs();
  }

  @Get('tasks/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取任务状态', description: '查询指定爬虫任务的执行状态' })
  async getTaskStatus(@Param('taskId') taskId: string) {
    return this.crawlerService.getTaskStatus(taskId);
  }

  @Post('ingest-camps')
  @ApiHeader({
    name: 'X-Crawler-Ingest-Key',
    required: true,
    description: '爬虫入库共享密钥（需与后端 CRAWLER_INGEST_KEY 一致）',
  })
  @ApiOperation({
    summary: '爬虫结果入库',
    description: '批量 upsert camp，并在字段变更时自动创建 ProgressChangeEvent（含 old/new/source）',
  })
  async ingestCamps(
    @Headers('x-crawler-ingest-key') ingestKey: string,
    @Body() dto: IngestCrawlerCampsDto,
  ) {
    const configuredKey = (process.env.CRAWLER_INGEST_KEY || '').trim();
    if (!configuredKey) {
      throw new UnauthorizedException(
        '服务端未配置 CRAWLER_INGEST_KEY，已拒绝 ingest 请求',
      );
    }
    if ((ingestKey || '').trim() !== configuredKey) {
      throw new UnauthorizedException('X-Crawler-Ingest-Key 无效');
    }

    return this.crawlerService.ingestCamps(dto.items, {
      emitBaselineEvents: dto.emitBaselineEvents !== false,
      sourceType: 'crawler',
    });
  }
}
