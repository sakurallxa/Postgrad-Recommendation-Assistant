import { CrawlerService } from './crawler.service';
export declare class CrawlerController {
    private readonly crawlerService;
    constructor(crawlerService: CrawlerService);
    trigger(universityId?: string, priority?: string, yearSpan?: string): Promise<{
        message: string;
        taskId: string;
        logId: string;
        status: string;
    }>;
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
