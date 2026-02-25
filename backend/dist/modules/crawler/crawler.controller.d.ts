import { CrawlerService } from './crawler.service';
export declare class CrawlerController {
    private readonly crawlerService;
    constructor(crawlerService: CrawlerService);
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
