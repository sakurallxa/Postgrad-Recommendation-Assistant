export declare const PROGRESS_EVENT_TYPE_VALUES: readonly ["deadline", "materials", "admission_result", "outstanding_result"];
export declare class CreateProgressEventDto {
    campId: string;
    eventType: (typeof PROGRESS_EVENT_TYPE_VALUES)[number];
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    sourceType?: string;
    sourceUrl?: string;
    sourceUpdatedAt?: string;
    confidenceLabel?: 'high' | 'medium' | 'low';
    confidenceScore?: number;
}
