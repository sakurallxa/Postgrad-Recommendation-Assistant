import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class ReminderScheduler {
    private readonly prisma;
    private readonly configService;
    private readonly logger;
    constructor(prisma: PrismaService, configService: ConfigService);
    scanAndSendReminders(): Promise<void>;
    cleanupExpiredReminders(): Promise<void>;
    private sendReminder;
    private callWxSubscribeApi;
    private getWxAccessToken;
    private formatDate;
}
