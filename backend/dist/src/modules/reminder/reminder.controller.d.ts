import { ReminderService } from './reminder.service';
export declare class ReminderController {
    private readonly reminderService;
    constructor(reminderService: ReminderService);
    findAll(userId: string, page: number, limit: number, status?: string): Promise<{
        data: ({
            camp: {
                id: string;
                university: {
                    id: string;
                    name: string;
                };
                title: string;
                deadline: Date;
            };
        } & {
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
