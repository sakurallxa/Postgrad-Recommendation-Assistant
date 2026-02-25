import { ConfigService } from '@nestjs/config';
export interface CampInfoExtraction {
    title: string;
    publishDate?: string;
    deadline?: string;
    startDate?: string;
    endDate?: string;
    requirements: {
        gradeRank?: string;
        english?: string;
        major?: string;
        other?: string;
    };
    materials: string[];
    process: string[];
    confidence: number;
}
export declare class DeepSeekService {
    private readonly configService;
    private readonly logger;
    private readonly apiKey;
    private readonly apiUrl;
    private dailyCallCount;
    private lastResetDate;
    constructor(configService: ConfigService);
    extractCampInfo(content: string, universityName: string): Promise<CampInfoExtraction | null>;
    private buildExtractionPrompt;
    private callDeepSeekAPI;
    private parseExtractionResult;
    private checkQuota;
    getQuotaStatus(): {
        dailyLimit: number;
        used: number;
        remaining: number;
        resetDate: string;
    };
}
