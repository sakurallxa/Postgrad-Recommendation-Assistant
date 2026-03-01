import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class CrawlerService {
    private readonly prisma;
    private readonly configService;
    private readonly logger;
    private readonly crawlerPath;
    private activeTasks;
    constructor(prisma: PrismaService, configService: ConfigService);
    trigger(universityId?: string, priority?: string, yearSpan?: number): Promise<{
        message: string;
        taskId: string;
        logId: string;
        status: string;
    }>;
    private executeCrawler;
    private scheduleTaskCleanup;
    private runScrapyCommand;
    private parseCrawlerOutput;
    getLogs(): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        universityId: string;
        errorMsg: string | null;
        startTime: Date;
        endTime: Date | null;
        itemsCount: number;
    }[]>;
    getTaskStatus(taskId: string): Promise<{
        taskId: string;
        logId: string;
        status: "pending" | "failed" | "running" | "completed";
        startTime: Date;
        endTime: Date;
        result: any;
        error: string;
        universityId?: undefined;
        itemsCount?: undefined;
        errorMsg?: undefined;
        createdAt?: undefined;
    } | {
        taskId: string;
        logId: string;
        status: string;
        universityId: string;
        itemsCount: number;
        errorMsg: string;
        createdAt: Date;
        startTime: Date;
        endTime: Date;
        result?: undefined;
        error?: undefined;
    }>;
}
