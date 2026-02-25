import { UniversityService } from './university.service';
export declare class UniversityController {
    private readonly universityService;
    constructor(universityService: UniversityService);
    findAll(page?: number, limit?: number, region?: string, level?: string): Promise<{
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            region: string | null;
            level: string | null;
            logo: string | null;
            website: string | null;
            priority: string;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
}
