import { PrismaService } from '../prisma/prisma.service';
export declare class CampService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(params: {
        page: number;
        limit: number;
        universityId?: string;
        universityIds?: string[];
        majorId?: string;
        status?: string;
        year?: number;
    }): Promise<{
        data: ({
            university: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                logo: string | null;
                region: string | null;
                level: string | null;
                website: string | null;
                priority: string;
            };
            major: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                universityId: string;
                name: string;
                category: string | null;
            };
        } & {
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            sourceUrl: string;
            universityId: string;
            majorId: string | null;
            publishDate: Date | null;
            deadline: Date | null;
            startDate: Date | null;
            endDate: Date | null;
            requirements: string | null;
            materials: string | null;
            process: string | null;
            confidence: number;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string): Promise<{
        university: {
            id: string;
            name: string;
            logo: string;
            level: string;
            website: string;
        };
        major: {
            id: string;
            name: string;
            category: string;
        };
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        sourceUrl: string;
        universityId: string;
        majorId: string | null;
        publishDate: Date | null;
        deadline: Date | null;
        startDate: Date | null;
        endDate: Date | null;
        requirements: string | null;
        materials: string | null;
        process: string | null;
        confidence: number;
    }>;
}
