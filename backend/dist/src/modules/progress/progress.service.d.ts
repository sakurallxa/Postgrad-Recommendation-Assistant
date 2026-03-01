import { PrismaService } from '../prisma/prisma.service';
import { CreateProgressDto } from './dto/create-progress.dto';
import { UpdateProgressStatusDto } from './dto/update-progress-status.dto';
import { UpdateProgressSubscriptionDto } from './dto/update-progress-subscription.dto';
import { CreateProgressEventDto } from './dto/create-progress-event.dto';
export declare class ProgressService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(userId: string, page?: number, limit?: number, status?: string): Promise<{
        data: ({
            camp: {
                id: string;
                status: string;
                title: string;
                deadline: Date;
                university: {
                    id: string;
                    name: string;
                };
            };
            subscription: {
                id: string;
                userId: string;
                createdAt: Date;
                updatedAt: Date;
                progressId: string;
                deadlineChanged: boolean;
                materialsChanged: boolean;
                admissionResultChanged: boolean;
                outstandingResultChanged: boolean;
                enabled: boolean;
            };
        } & {
            id: string;
            userId: string;
            campId: string;
            status: string;
            nextAction: string | null;
            statusNote: string | null;
            lastStatusAt: Date;
            submittedAt: Date | null;
            admissionPublishedAt: Date | null;
            admittedAt: Date | null;
            outstandingPublishedAt: Date | null;
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
    findOne(userId: string, progressId: string): Promise<{
        camp: {
            university: {
                id: string;
                name: string;
                website: string;
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
        };
        statusLogs: {
            id: string;
            progressId: string;
            changedAt: Date;
            fromStatus: string | null;
            toStatus: string;
            note: string | null;
        }[];
        subscription: {
            id: string;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
            progressId: string;
            deadlineChanged: boolean;
            materialsChanged: boolean;
            admissionResultChanged: boolean;
            outstandingResultChanged: boolean;
            enabled: boolean;
        };
    } & {
        id: string;
        userId: string;
        campId: string;
        status: string;
        nextAction: string | null;
        statusNote: string | null;
        lastStatusAt: Date;
        submittedAt: Date | null;
        admissionPublishedAt: Date | null;
        admittedAt: Date | null;
        outstandingPublishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(userId: string, dto: CreateProgressDto): Promise<{
        camp: {
            university: {
                id: string;
                name: string;
                website: string;
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
        };
        statusLogs: {
            id: string;
            progressId: string;
            changedAt: Date;
            fromStatus: string | null;
            toStatus: string;
            note: string | null;
        }[];
        subscription: {
            id: string;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
            progressId: string;
            deadlineChanged: boolean;
            materialsChanged: boolean;
            admissionResultChanged: boolean;
            outstandingResultChanged: boolean;
            enabled: boolean;
        };
    } & {
        id: string;
        userId: string;
        campId: string;
        status: string;
        nextAction: string | null;
        statusNote: string | null;
        lastStatusAt: Date;
        submittedAt: Date | null;
        admissionPublishedAt: Date | null;
        admittedAt: Date | null;
        outstandingPublishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateStatus(userId: string, progressId: string, dto: UpdateProgressStatusDto): Promise<{
        camp: {
            university: {
                id: string;
                name: string;
                website: string;
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
        };
        statusLogs: {
            id: string;
            progressId: string;
            changedAt: Date;
            fromStatus: string | null;
            toStatus: string;
            note: string | null;
        }[];
        subscription: {
            id: string;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
            progressId: string;
            deadlineChanged: boolean;
            materialsChanged: boolean;
            admissionResultChanged: boolean;
            outstandingResultChanged: boolean;
            enabled: boolean;
        };
    } & {
        id: string;
        userId: string;
        campId: string;
        status: string;
        nextAction: string | null;
        statusNote: string | null;
        lastStatusAt: Date;
        submittedAt: Date | null;
        admissionPublishedAt: Date | null;
        admittedAt: Date | null;
        outstandingPublishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getSubscription(userId: string, progressId: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        progressId: string;
        deadlineChanged: boolean;
        materialsChanged: boolean;
        admissionResultChanged: boolean;
        outstandingResultChanged: boolean;
        enabled: boolean;
    }>;
    updateSubscription(userId: string, progressId: string, dto: UpdateProgressSubscriptionDto): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        progressId: string;
        deadlineChanged: boolean;
        materialsChanged: boolean;
        admissionResultChanged: boolean;
        outstandingResultChanged: boolean;
        enabled: boolean;
    }>;
    listAlerts(userId: string, page?: number, limit?: number, status?: string): Promise<{
        data: ({
            event: {
                id: string;
                confidenceLabel: string;
                eventType: string;
                fieldName: string;
                oldValue: string;
                newValue: string;
                sourceType: string;
                sourceUpdatedAt: Date;
            };
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
            campId: string | null;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            priority: string;
            progressId: string | null;
            eventId: string | null;
            type: string;
            content: string;
            confidenceLabel: string | null;
            scheduledAt: Date;
            snoozeUntil: Date | null;
            handledAt: Date | null;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    handleAlert(userId: string, alertId: string): Promise<{
        id: string;
        userId: string;
        campId: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        priority: string;
        progressId: string | null;
        eventId: string | null;
        type: string;
        content: string;
        confidenceLabel: string | null;
        scheduledAt: Date;
        snoozeUntil: Date | null;
        handledAt: Date | null;
    }>;
    snoozeAlert(userId: string, alertId: string, hours?: number): Promise<{
        id: string;
        userId: string;
        campId: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        priority: string;
        progressId: string | null;
        eventId: string | null;
        type: string;
        content: string;
        confidenceLabel: string | null;
        scheduledAt: Date;
        snoozeUntil: Date | null;
        handledAt: Date | null;
    }>;
    createChangeEvent(dto: CreateProgressEventDto): Promise<{
        event: {
            id: string;
            campId: string;
            createdAt: Date;
            sourceUrl: string | null;
            confidenceLabel: string;
            eventType: string;
            fieldName: string | null;
            oldValue: string | null;
            newValue: string | null;
            sourceType: string;
            sourceUpdatedAt: Date | null;
            confidenceScore: number;
        };
        notifiedUsers: number;
        confidence: {
            label: string;
            score: number;
        };
    }>;
    private assertProgressOwner;
    private validateStatusTransition;
    private createDeadlineStageAlerts;
    private createResultWatchAlert;
    private shouldNotifyBySubscription;
    private resolveConfidence;
    private normalizeConfidenceScore;
    private buildEventAlertTitle;
    private buildEventAlertContent;
    private mapEventPriority;
}
