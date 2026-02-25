import { PrismaService } from '../prisma/prisma.service';
export declare class ReminderService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        userId: string;
        campId: string;
        remindTime: Date;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
    }[]>;
    create(dto: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        userId: string;
        campId: string;
        remindTime: Date;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        userId: string;
        campId: string;
        remindTime: Date;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
    }>;
}
