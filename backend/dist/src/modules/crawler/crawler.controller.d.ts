import { CrawlerService } from './crawler.service';
export declare class CrawlerController {
    private readonly crawlerService;
    constructor(crawlerService: CrawlerService);
    trigger(universityId?: string, priority?: string): Promise<{
        message: string;
        taskId: string;
        status: string;
    }>;
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
}
