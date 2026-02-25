import { PrismaService } from '../prisma/prisma.service';
export declare class UniversityService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(params: {
        page: number;
        limit: number;
        region?: string;
        level?: string;
    }): Promise<{
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
