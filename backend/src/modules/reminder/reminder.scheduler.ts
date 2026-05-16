import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { OpenidCryptoService } from '../../common/services/openid-crypto.service';

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
    private readonly openidCryptoService: OpenidCryptoService,
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
   * 每分钟扫描并发送变更类微信提醒（准实时）
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchProgressWechatAlerts() {
    const now = new Date();
    const batchSize = 50;
    try {
      const alerts = await this.prisma.progressAlert.findMany({
        where: {
          channel: 'wechat',
          status: 'pending',
          sendStatus: 'pending',
          scheduledAt: { lte: now },
        },
        include: {
          user: true,
          camp: {
            include: {
              university: true,
            },
          },
          event: true,
        },
        orderBy: { scheduledAt: 'asc' },
        take: batchSize,
      });

      if (alerts.length === 0) {
        return;
      }

      this.logger.log(`开始发送变更微信提醒: ${alerts.length} 条`);
      for (const alert of alerts) {
        await this.sendProgressWechatAlert(alert);
      }
    } catch (error) {
      this.logger.error(`发送变更微信提醒失败: ${error.message}`);
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
      const touser = this.resolveUserOpenid(user);

      // 构建微信订阅消息 —— 「报名时间提醒」模板字段映射
      //   thing9 = 活动名称（公告标题，≤20 字）
      //   time7  = 截止时间（yyyy年M月d日 HH:mm）
      //   thing3 = 温馨提示（学校 · 剩 X 天，≤20 字）
      const message: WxSubscribeMessage = {
        touser,
        template_id: templateId || this.configService.get('WX_SUBSCRIBE_TEMPLATE_ID'),
        page: `/pages/camp/detail?id=${camp.id}`,
        data: {
          thing9: { value: this.clampThing(camp.title || '保研公告') },
          time7: { value: this.formatWxTime(camp.deadline) },
          thing3: { value: this.buildReminderTip(camp.university?.name, camp.deadline) },
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

  private async sendProgressWechatAlert(alert: any): Promise<void> {
    const lockResult = await this.prisma.progressAlert.updateMany({
      where: {
        id: alert.id,
        sendStatus: 'pending',
      },
      data: {
        sendStatus: 'sending',
      },
    });
    if (!lockResult.count) {
      return;
    }

    try {
      const touser = this.resolveUserOpenid(alert.user);
      const templateId =
        this.configService.get('WX_PROGRESS_CHANGE_TEMPLATE_ID')
        || this.configService.get('WX_SUBSCRIBE_TEMPLATE_ID');

      const campTitle = alert.camp?.title || '保研公告';
      const universityName = alert.camp?.university?.name || '院校公告';
      const changeField = this.resolveProgressChangeLabel(alert.event, alert.title);
      const changeTime = alert.event?.sourceUpdatedAt || alert.createdAt || new Date();
      const actionTokenEnabled = String(
        this.configService.get('WECHAT_ACTION_TOKEN_ENABLED') || 'false',
      ).toLowerCase() === 'true';
      const messagePage = actionTokenEnabled && alert.actionToken
        ? `/packageProgress/pages/action-landing/index?token=${encodeURIComponent(alert.actionToken)}`
        : '/pages/my-reminders/index';

      const message: WxSubscribeMessage = {
        touser,
        template_id: templateId,
        page: messagePage,
        data: {
          thing1: { value: campTitle.slice(0, 20) },
          thing3: { value: `${universityName} ${changeField}`.slice(0, 20) },
          time4: { value: this.formatDate(changeTime) },
        },
      };

      const result = await this.callWxSubscribeApi(message);
      if (result.success) {
        await this.prisma.progressAlert.update({
          where: { id: alert.id },
          data: {
            sendStatus: 'sent',
            sentAt: new Date(),
            lastError: null,
            sendAttempt: {
              increment: 1,
            },
          },
        });
        return;
      }

      await this.prisma.progressAlert.update({
        where: { id: alert.id },
        data: {
          sendStatus: 'failed',
          lastError: result.error || 'unknown',
          sendAttempt: {
            increment: 1,
          },
        },
      });
    } catch (error) {
      await this.prisma.progressAlert.update({
        where: { id: alert.id },
        data: {
          sendStatus: 'failed',
          lastError: error.message || 'unknown',
          sendAttempt: {
            increment: 1,
          },
        },
      });
    }
  }

  private resolveProgressChangeLabel(event: any, fallbackTitle?: string): string {
    const eventType = String(event?.eventType || '').trim();
    const fieldName = String(event?.fieldName || '').trim();

    if (eventType === 'deadline' || fieldName === 'deadline' || fieldName === 'startDate' || fieldName === 'endDate' || fieldName === 'publishDate') {
      return '时间更新';
    }
    if (eventType === 'admission_result') {
      return '入营结果更新';
    }
    if (eventType === 'outstanding_result') {
      return '优秀营员结果更新';
    }
    if (fallbackTitle && /截止|时间|入营|优秀营员/.test(fallbackTitle)) {
      return fallbackTitle;
    }
    return '公告更新';
  }

  private resolveUserOpenid(user: any): string {
    if (user?.openidCipher) {
      return this.openidCryptoService.decrypt(user.openidCipher);
    }

    // 兼容旧数据
    if (user?.openid) {
      return user.openid;
    }

    throw new Error('用户openid不可用');
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
   * 格式化日期 —— 用于变更提醒类（旧模板 time4 字段）
   */
  private formatDate(date: Date | null): string {
    if (!date) return '未设置';
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  /**
   * 微信订阅消息 time 类字段格式化
   * 输出 `yyyy年M月d日 HH:mm`，符合微信 time 类字段允许的格式之一
   * 若 date 为空则返回当前时间，确保通过校验（避免 47003）
   */
  private formatWxTime(date: Date | null): string {
    const d = date && !isNaN(date.getTime()) ? date : new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dd = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${dd}日 ${hh}:${mi}`;
  }

  /**
   * 微信订阅消息 thing 类字段统一截断（≤20 字符）
   */
  private clampThing(text: string, max = 20): string {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
  }

  /**
   * 拼装温馨提示文案：「学校 · 剩 X 天」
   * 总长度超 20 字符则只保留 "剩 X 天"，已过截止则用"今日截止"
   */
  private buildReminderTip(universityName?: string | null, deadline?: Date | null): string {
    const days =
      deadline && !isNaN(deadline.getTime())
        ? Math.ceil((deadline.getTime() - Date.now()) / 86400000)
        : null;
    let daysText: string;
    if (days == null) daysText = '即将截止';
    else if (days < 0) daysText = '已过期';
    else if (days === 0) daysText = '今日截止';
    else daysText = `剩${days}天`;

    const name = (universityName || '').trim();
    if (!name) return this.clampThing(daysText);
    const combined = `${name} · ${daysText}`;
    if (combined.length <= 20) return combined;
    return this.clampThing(daysText);
  }
}
