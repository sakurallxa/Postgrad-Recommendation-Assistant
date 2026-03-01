export declare const PROGRESS_STATUS_VALUES: readonly ["followed", "preparing", "submitted", "waiting_admission", "admitted", "waiting_outstanding", "outstanding_published"];
export declare class CreateProgressDto {
    campId: string;
    status?: (typeof PROGRESS_STATUS_VALUES)[number];
    nextAction?: string;
    note?: string;
}
