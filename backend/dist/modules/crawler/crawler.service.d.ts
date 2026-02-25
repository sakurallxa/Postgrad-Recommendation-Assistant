import { PrismaService } from '../prisma/prisma.service';
export declare class CrawlerService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    trigger(): Promise<{
        message: string;
        status: string;
    }>;
    getLogs(): Promise<{
        id: string;
        createdAt: Date;
        universityId: string;
        status: string;
        errorMsg: string | null;
        startTime: Date;
        endTime: Date | null;
        itemsCount: number;
    }[]>;
}
