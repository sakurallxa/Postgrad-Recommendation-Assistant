import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class CrawlerService {
    private readonly prisma;
    private readonly configService;
    private readonly logger;
    private readonly crawlerPath;
    private activeTasks;
    constructor(prisma: PrismaService, configService: ConfigService);
    trigger(universityId?: string, priority?: string): Promise<{
        message: string;
        taskId: string;
        status: string;
    }>;
    private executeCrawler;
    private runScrapyCommand;
    private parseCrawlerOutput;
    getLogs(): Promise<{
        id: string;
        universityId: string;
        status: string;
        startTime: Date;
        endTime: Date | null;
        errorMsg: string | null;
        itemsCount: number;
        createdAt: Date;
    }[]>;
    getTaskStatus(taskId: string): Promise<{
        taskId: string;
        status: string;
        universityId: string;
        itemsCount: number;
        errorMsg: string;
        createdAt: Date;
        startTime: Date;
        endTime: Date;
        result?: undefined;
        error?: undefined;
    } | {
        taskId: string;
        status: "running" | "pending" | "completed" | "failed";
        startTime: Date;
        endTime: Date;
        result: any;
        error: string;
        universityId?: undefined;
        itemsCount?: undefined;
        errorMsg?: undefined;
        createdAt?: undefined;
    }>;
    private generateTaskId;
}
