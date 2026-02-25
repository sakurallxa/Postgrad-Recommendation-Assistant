import { PrismaService } from '../prisma/prisma.service';
import { QueryUniversityDto } from './dto/query-university.dto';
export declare class UniversityService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(query: QueryUniversityDto): Promise<{
        data: {
            majorCount: number;
            campInfoCount: number;
            _count: any;
            id: string;
            name: string;
            logo: string;
            region: string;
            level: string;
            website: string;
            priority: string;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string): Promise<{
        majors: {
            id: string;
            name: string;
            category: string;
        }[];
        campInfos: {
            id: string;
            title: string;
            deadline: Date;
            status: string;
        }[];
    } & {
        id: string;
        name: string;
        logo: string | null;
        region: string | null;
        level: string | null;
        website: string | null;
        priority: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findMajors(universityId: string): Promise<{
        universityId: string;
        universityName: string;
        majors: {
            id: string;
            name: string;
            category: string;
        }[];
        total: number;
    }>;
}
