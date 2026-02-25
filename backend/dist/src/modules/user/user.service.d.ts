import { PrismaService } from '../prisma/prisma.service';
import { UpdateSelectionDto } from './dto/update-selection.dto';
export declare class UserService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private safeJsonParse;
    getProfile(userId: string): Promise<{
        selection: {
            universityIds: string;
            majorIds: string;
        };
        id: string;
        openid: string;
        createdAt: Date;
    }>;
    getSelection(userId: string): Promise<{
        universityIds: any[];
        majorIds: any[];
        universities?: undefined;
        majors?: undefined;
        totalUniversities?: undefined;
        totalMajors?: undefined;
    } | {
        universities: {
            id: string;
            name: string;
            logo: string;
            level: string;
        }[];
        majors: {
            id: string;
            name: string;
            university: {
                id: string;
                name: string;
            };
            category: string;
        }[];
        totalUniversities: number;
        totalMajors: number;
        universityIds?: undefined;
        majorIds?: undefined;
    }>;
    updateSelection(userId: string, dto: UpdateSelectionDto): Promise<{
        message: string;
        selection: {
            universityIds: string[];
            majorIds: string[];
        };
    }>;
}
