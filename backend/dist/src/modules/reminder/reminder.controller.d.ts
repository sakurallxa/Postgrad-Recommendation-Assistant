import { ReminderService } from './reminder.service';
export declare class ReminderController {
    private readonly reminderService;
    constructor(reminderService: ReminderService);
    findAll(page: number, limit: number): Promise<{
        data: {
            id: string;
            userId: string;
            campId: string;
            remindTime: Date;
            status: string;
            templateId: string | null;
            sentAt: Date | null;
            errorMsg: string | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    create(dto: any): Promise<{
        id: string;
        userId: string;
        campId: string;
        remindTime: Date;
        status: string;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        id: string;
        userId: string;
        campId: string;
        remindTime: Date;
        status: string;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
