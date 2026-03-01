import { PROGRESS_STATUS_VALUES } from './create-progress.dto';
export declare class UpdateProgressStatusDto {
    status: (typeof PROGRESS_STATUS_VALUES)[number];
    note?: string;
    nextAction?: string;
}
