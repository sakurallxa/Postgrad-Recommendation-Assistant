import { UniversityService } from './university.service';
import { QueryUniversityDto } from './dto/query-university.dto';
export declare class UniversityController {
    private readonly universityService;
    constructor(universityService: UniversityService);
    findAll(query: QueryUniversityDto): Promise<{
        data: {
            majorCount: number;
            campInfoCount: number;
            _count: any;
            name: string;
            priority: string;
            id: string;
            logo: string;
            region: string;
            level: string;
            website: string;
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
            name: string;
            id: string;
            category: string;
        }[];
        campInfos: {
            id: string;
            title: string;
            deadline: Date;
            status: string;
        }[];
    } & {
        name: string;
        priority: string;
        createdAt: Date;
        updatedAt: Date;
        id: string;
        logo: string | null;
        region: string | null;
        level: string | null;
        website: string | null;
    }>;
    findMajors(id: string): Promise<{
        universityId: string;
        universityName: string;
        majors: {
            name: string;
            id: string;
            category: string;
        }[];
        total: number;
    }>;
}
