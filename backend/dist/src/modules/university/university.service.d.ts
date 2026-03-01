import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { QueryUniversityDto } from './dto/query-university.dto';
export declare class UniversityService {
    private readonly prisma;
    private readonly redisService;
    constructor(prisma: PrismaService, redisService: RedisService);
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
            status: string;
            title: string;
            deadline: Date;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        logo: string | null;
        region: string | null;
        level: string | null;
        website: string | null;
        priority: string;
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
