import { ReminderService } from './reminder.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
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
            status: string;
            createdAt: Date;
            updatedAt: Date;
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
    create(userId: string, dto: CreateReminderDto): Promise<{
        id: string;
        userId: string;
        campId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        remindTime: Date;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
    }>;
    remove(userId: string, id: string): Promise<{
        id: string;
        userId: string;
        campId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        remindTime: Date;
        templateId: string | null;
        sentAt: Date | null;
        errorMsg: string | null;
    }>;
}
