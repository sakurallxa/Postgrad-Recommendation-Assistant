import { CampService } from './camp.service';
export declare class CampController {
    private readonly campService;
    constructor(campService: CampService);
    findAll(page?: number, limit?: number, universityId?: string, majorId?: string): Promise<{
        data: ({
            university: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                region: string | null;
                level: string | null;
                logo: string | null;
                website: string | null;
                priority: string;
            };
            major: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                universityId: string;
                category: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            universityId: string;
            majorId: string | null;
            sourceUrl: string;
            publishDate: Date | null;
            deadline: Date | null;
            startDate: Date | null;
            endDate: Date | null;
            requirements: string | null;
            materials: string | null;
            process: string | null;
            status: string;
            confidence: number;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
}
