"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ReminderScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReminderScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let ReminderScheduler = ReminderScheduler_1 = class ReminderScheduler {
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(ReminderScheduler_1.name);
    }
    async scanAndSendReminders() {
        this.logger.log('开始扫描待发送提醒...');
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        try {
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
            const results = await Promise.allSettled(pendingReminders.map(reminder => this.sendReminder(reminder)));
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            this.logger.log(`提醒发送完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);
        }
        catch (error) {
            this.logger.error('扫描提醒任务失败:', error.message);
        }
    }
    async cleanupExpiredReminders() {
        this.logger.log('开始清理过期提醒...');
        const now = new Date();
        try {
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
        }
        catch (error) {
            this.logger.error('清理过期提醒失败:', error.message);
        }
    }
    async sendReminder(reminder) {
        const { id, user, camp, templateId } = reminder;
        try {
            const message = {
                touser: user.openid,
                template_id: templateId || this.configService.get('WX_SUBSCRIBE_TEMPLATE_ID'),
                page: `/pages/camp/detail?id=${camp.id}`,
                data: {
                    thing1: { value: camp.title },
                    time2: { value: this.formatDate(camp.deadline) },
                    thing3: { value: camp.university.name },
                },
            };
            const result = await this.callWxSubscribeApi(message);
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
            }
            else {
                this.logger.warn(`提醒发送失败: ${id}, 错误: ${result.error}`);
            }
            return result;
        }
        catch (error) {
            this.logger.error(`发送提醒异常: ${id}`, error.message);
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
    async callWxSubscribeApi(message) {
        const appid = this.configService.get('WECHAT_APPID');
        const secret = this.configService.get('WECHAT_SECRET');
        if (!appid || appid === 'wx_appid_placeholder') {
            this.logger.warn('微信配置未设置，使用模拟发送');
            return { success: true, messageId: 'mock_message_id' };
        }
        try {
            const accessToken = await this.getWxAccessToken(appid, secret);
            const response = await axios_1.default.post(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`, message, { timeout: 10000 });
            if (response.data.errcode === 0) {
                return { success: true, messageId: response.data.msgid };
            }
            else {
                return {
                    success: false,
                    error: `微信API错误: ${response.data.errmsg} (${response.data.errcode})`,
                };
            }
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async getWxAccessToken(appid, secret) {
        const response = await axios_1.default.get('https://api.weixin.qq.com/cgi-bin/token', {
            params: {
                grant_type: 'client_credential',
                appid,
                secret,
            },
            timeout: 10000,
        });
        if (response.data.access_token) {
            return response.data.access_token;
        }
        else {
            throw new Error(`获取access_token失败: ${response.data.errmsg}`);
        }
    }
    formatDate(date) {
        if (!date)
            return '未设置';
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    }
};
exports.ReminderScheduler = ReminderScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReminderScheduler.prototype, "scanAndSendReminders", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReminderScheduler.prototype, "cleanupExpiredReminders", null);
exports.ReminderScheduler = ReminderScheduler = ReminderScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], ReminderScheduler);
//# sourceMappingURL=reminder.scheduler.js.map