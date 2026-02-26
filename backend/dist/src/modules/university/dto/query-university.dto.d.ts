export declare const ALLOWED_SORT_FIELDS: readonly ["name", "priority", "createdAt", "updatedAt"];
export type SortField = typeof ALLOWED_SORT_FIELDS[number];
export declare class QueryUniversityDto {
    page?: number;
    limit?: number;
    region?: string;
    level?: string;
    keyword?: string;
    sortBy?: SortField;
    sortOrder?: 'asc' | 'desc';
}
