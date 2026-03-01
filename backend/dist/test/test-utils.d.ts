import { PrismaClient } from '@prisma/client';
export declare const prisma: PrismaClient<{
    datasources: {
        db: {
            url: string;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export declare function cleanDatabase(): Promise<void>;
export declare function createTestUniversities(): Promise<any[]>;
export declare function createTestMajors(universityId: string): Promise<any[]>;
export declare function createTestCamps(universityId: string, majorId?: string): Promise<any[]>;
export declare function createTestUser(openid?: string): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    openid: string | null;
    openidHash: string | null;
    openidCipher: string | null;
}>;
export declare function createTestReminder(userId: string, campId: string): Promise<{
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
export declare function generateTestToken(userId: string, openid: string): string;
export declare class TestDataBuilder {
    private universities;
    private majors;
    private camps;
    private users;
    private reminders;
    buildUniversities(count?: number): Promise<this>;
    buildMajors(universityIndex?: number): Promise<this>;
    buildCamps(universityIndex?: number, majorIndex?: number): Promise<this>;
    buildUsers(count?: number): Promise<this>;
    buildReminders(userIndex?: number, campIndex?: number): Promise<this>;
    getUniversities(): any[];
    getMajors(): any[];
    getCamps(): any[];
    getUsers(): any[];
    getReminders(): any[];
    cleanup(): Promise<void>;
}
export declare function delay(ms: number): Promise<void>;
export declare function assertPaginationMeta(meta: any, expected: {
    page: number;
    limit: number;
    total: number;
}): void;
export declare function assertResponseStructure(response: any): void;
