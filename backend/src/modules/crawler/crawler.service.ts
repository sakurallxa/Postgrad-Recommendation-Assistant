import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CrawlerService {
  constructor(private readonly prisma: PrismaService) {}

  async trigger() {
    // TODO: 调用Python爬虫服务
    return {
      message: '爬虫任务已触发',
      status: 'running',
    };
  }

  async getLogs() {
    return this.prisma.crawlerLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
