import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CrawlerService } from './crawler.service';

/**
 * 爬虫定时调度器
 *
 * 调度策略（β 场景：私人研招助手）：
 * 1. 每日凌晨 3 点：全量重抓 5 所重点校（P0），刷新 deadline / materials 等关键字段
 *    重抓后，crawler.service.diffCamp() 会自动比对已入库数据并触发 ProgressChangeEvent
 *    → 关注用户即时收到"截止日期已更新"等通知
 * 2. 每周日凌晨 4 点：扫描其他 985（P1/P2），频率较低以节省 LLM 配额
 *
 * 关闭方式：设置环境变量 CRAWLER_SCHEDULER_ENABLED=false
 */
@Injectable()
export class CrawlerScheduler {
  private readonly logger = new Logger(CrawlerScheduler.name);

  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(): boolean {
    const flag = this.configService.get<string>('CRAWLER_SCHEDULER_ENABLED');
    return flag !== 'false';
  }

  /**
   * 每日 03:00 重抓 5 所重点校（P0 优先级）
   * 重要：差异化字段会自动触发 ProgressChangeEvent，关注该公告的用户会被通知
   */
  @Cron('0 3 * * *', { name: 'recrawl-priority-schools' })
  async recrawlPrioritySchools() {
    if (!this.isEnabled()) {
      this.logger.debug('CrawlerScheduler 已禁用，跳过 P0 重抓');
      return;
    }
    this.logger.log('🔄 启动每日 P0 重点校重抓...');
    try {
      const result = await this.crawlerService.trigger(undefined, 'P0', 1);
      this.logger.log(`P0 重抓任务已触发: ${JSON.stringify(result)}`);
    } catch (error: any) {
      // 已有任务运行时 trigger 会抛 BadRequest，是预期行为
      if (error?.status === 400 || error?.response?.statusCode === 400) {
        this.logger.warn(`P0 重抓跳过（已有任务运行）: ${error.message}`);
      } else {
        this.logger.error(`P0 重抓失败: ${error.message}`, error.stack);
      }
    }
  }

  /**
   * 每周日 04:00 扫描其他 985（P1/P2），保持基础覆盖
   */
  @Cron('0 4 * * 0', { name: 'recrawl-other-985' })
  async recrawlOtherSchools() {
    if (!this.isEnabled()) {
      this.logger.debug('CrawlerScheduler 已禁用，跳过 P1/P2 周扫');
      return;
    }
    this.logger.log('🔄 启动每周 P1/P2 学校扫描...');
    try {
      // P1 优先级先扫
      const result = await this.crawlerService.trigger(undefined, 'P1', 1);
      this.logger.log(`P1 扫描任务已触发: ${JSON.stringify(result)}`);
    } catch (error: any) {
      if (error?.status === 400 || error?.response?.statusCode === 400) {
        this.logger.warn(`P1 扫描跳过（已有任务运行）: ${error.message}`);
      } else {
        this.logger.error(`P1 扫描失败: ${error.message}`, error.stack);
      }
    }
  }
}
