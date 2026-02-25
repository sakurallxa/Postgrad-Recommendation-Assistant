import { ReminderService } from './reminder.service';
export declare class ReminderController {
    private readonly reminderService;
    constructor(reminderService: ReminderService);
    findAll(userId: string, page: number, limit: number, status?: string): Promise<{
        data: ({
            camp: {
                id: string;
                title: string;
                deadline: Date;
                university: {
                    id: string;
                    name: string;
                };
            };
        } & {
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
        })[];
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
