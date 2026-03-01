import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OpenidCryptoService } from '../../common/services/openid-crypto.service';
export declare class ReminderScheduler {
    private readonly prisma;
    private readonly configService;
    private readonly openidCryptoService;
    private readonly logger;
    constructor(prisma: PrismaService, configService: ConfigService, openidCryptoService: OpenidCryptoService);
    scanAndSendReminders(): Promise<void>;
    cleanupExpiredReminders(): Promise<void>;
    private sendReminder;
    private resolveUserOpenid;
    private callWxSubscribeApi;
    private getWxAccessToken;
    private formatDate;
}
