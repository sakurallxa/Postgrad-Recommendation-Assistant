import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * 微信订阅消息模板数据
 */
interface WxSubscribeMessage {
  touser: string;
  template_id: string;
  page?: string;
  data: Record<string, { value: string }>;
}

/**
 * 提醒发送结果
 */
interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 每小时扫描并发送提醒
   * 扫描未来1小时内需要发送的提醒
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scanAndSendReminders() {
    this.logger.log('开始扫描待发送提醒...');

    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    try {
      // 查找未来1小时内需要发送的提醒
      const pendingReminders = await this.prisma.reminder.findMany({
        where: {
          status: 'pending',
          remindTime: {
            gte: now,
            lte: oneHourLater,
          },
        },
        include: {
          user: true,
          camp: {
            include: {
              university: true,
            },
          },
        },
      });

      this.logger.log(`找到 ${pendingReminders.length} 个待发送提醒`);

      // 发送提醒
      const results = await Promise.allSettled(
        pendingReminders.map(reminder => this.sendReminder(reminder)),
      );

      // 统计结果
      const successCount = results.filter(
        r => r.status === 'fulfilled' && (r.value as SendResult).success,
      ).length;
      const failCount = results.length - successCount;

      this.logger.log(
        `提醒发送完成: 成功 ${successCount} 个, 失败 ${failCount} 个`,
      );
    } catch (error) {
      this.logger.error('扫描提醒任务失败:', error.message);
    }
  }

  /**
   * 每天凌晨清理过期提醒
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredReminders() {
    this.logger.log('开始清理过期提醒...');

    const now = new Date();

    try {
      // 将已过期的提醒标记为expired
      const result = await this.prisma.reminder.updateMany({
        where: {
          status: 'pending',
          remindTime: {
            lt: now,
          },
        },
        data: {
          status: 'expired',
        },
      });

      this.logger.log(`已清理 ${result.count} 个过期提醒`);
    } catch (error) {
      this.logger.error('清理过期提醒失败:', error.message);
    }
  }

  /**
   * 发送单个提醒
   */
  private async sendReminder(reminder: any): Promise<SendResult> {
    const { id, user, camp, templateId } = reminder;

    try {
      // 构建微信订阅消息
      const message: WxSubscribeMessage = {
        touser: user.openid,
        template_id: templateId || this.configService.get('WX_SUBSCRIBE_TEMPLATE_ID'),
        page: `/pages/camp/detail?id=${camp.id}`,
        data: {
          thing1: { value: camp.title },
          time2: { value: this.formatDate(camp.deadline) },
          thing3: { value: camp.university.name },
        },
      };

      // 调用微信API发送订阅消息
      const result = await this.callWxSubscribeApi(message);

      // 更新提醒状态
      await this.prisma.reminder.update({
        where: { id },
        data: {
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
          errorMsg: result.error || null,
        },
      });

      if (result.success) {
        this.logger.log(`提醒发送成功: ${id}`);
      } else {
        this.logger.warn(`提醒发送失败: ${id}, 错误: ${result.error}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`发送提醒异常: ${id}`, error.message);

      // 更新为失败状态
      await this.prisma.reminder.update({
        where: { id },
        data: {
          status: 'failed',
          errorMsg: error.message,
        },
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * 调用微信订阅消息API
   */
  private async callWxSubscribeApi(
    message: WxSubscribeMessage,
  ): Promise<SendResult> {
    const appid = this.configService.get('WECHAT_APPID');
    const secret = this.configService.get('WECHAT_SECRET');

    // 检查配置
    if (!appid || appid === 'wx_appid_placeholder') {
      this.logger.warn('微信配置未设置，使用模拟发送');
      return { success: true, messageId: 'mock_message_id' };
    }

    try {
      // 获取access_token
      const accessToken = await this.getWxAccessToken(appid, secret);

      // 发送订阅消息
      const response = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        message,
        { timeout: 10000 },
      );

      if (response.data.errcode === 0) {
        return { success: true, messageId: response.data.msgid };
      } else {
        return {
          success: false,
          error: `微信API错误: ${response.data.errmsg} (${response.data.errcode})`,
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取微信access_token
   */
  private async getWxAccessToken(
    appid: string,
    secret: string,
  ): Promise<string> {
    // TODO: 实现access_token缓存
    const response = await axios.get(
      'https://api.weixin.qq.com/cgi-bin/token',
      {
        params: {
          grant_type: 'client_credential',
          appid,
          secret,
        },
        timeout: 10000,
      },
    );

    if (response.data.access_token) {
      return response.data.access_token;
    } else {
      throw new Error(`获取access_token失败: ${response.data.errmsg}`);
    }
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date | null): string {
    if (!date) return '未设置';
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}
