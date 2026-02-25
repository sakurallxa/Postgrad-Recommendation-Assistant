import { Controller, Post, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CrawlerService } from './crawler.service';

@ApiTags('爬虫')
@Controller('crawler')
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Post('trigger')
  @ApiOperation({ summary: '手动触发爬虫' })
  async trigger() {
    return this.crawlerService.trigger();
  }

  @Get('logs')
  @ApiOperation({ summary: '获取爬虫日志' })
  async getLogs() {
    return this.crawlerService.getLogs();
  }
}
