"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestDataBuilder = exports.prisma = void 0;
exports.cleanDatabase = cleanDatabase;
exports.createTestUniversities = createTestUniversities;
exports.createTestMajors = createTestMajors;
exports.createTestCamps = createTestCamps;
exports.createTestUser = createTestUser;
exports.createTestReminder = createTestReminder;
exports.generateTestToken = generateTestToken;
exports.delay = delay;
exports.assertPaginationMeta = assertPaginationMeta;
exports.assertResponseStructure = assertResponseStructure;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: 'file:./test.db',
        },
    },
});
async function cleanDatabase() {
    const tables = [
        'reminders',
        'camp_infos',
        'user_selections',
        'users',
        'majors',
        'universities',
        'crawler_logs',
    ];
    for (const table of tables) {
        try {
            await exports.prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
        }
        catch (error) {
        }
    }
}
async function createTestUniversities() {
    const universities = [
        { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
        { name: '北京大学', region: '北京', level: '985', priority: 'P0' },
        { name: '复旦大学', region: '上海', level: '985', priority: 'P0' },
        { name: '上海交通大学', region: '上海', level: '985', priority: 'P0' },
        { name: '南京大学', region: '江苏', level: '985', priority: 'P1' },
        { name: '普通大学', region: '其他', level: '普通', priority: 'P3' },
    ];
    const created = [];
    for (const data of universities) {
        const univ = await exports.prisma.university.create({ data });
        created.push(univ);
    }
    return created;
}
async function createTestMajors(universityId) {
    const majors = [
        { name: '计算机科学与技术', category: '工学', universityId },
        { name: '软件工程', category: '工学', universityId },
        { name: '人工智能', category: '工学', universityId },
        { name: '金融学', category: '经济学', universityId },
        { name: '法学', category: '法学', universityId },
    ];
    const created = [];
    for (const data of majors) {
        const major = await exports.prisma.major.create({ data });
        created.push(major);
    }
    return created;
}
async function createTestCamps(universityId, majorId) {
    const camps = [
        {
            title: '2026年计算机学院夏令营',
            sourceUrl: 'http://example.com/camp1',
            universityId,
            majorId,
            publishDate: new Date('2026-03-01'),
            deadline: new Date('2026-06-30'),
            status: 'published',
            confidence: 0.95,
        },
        {
            title: '2026年软件学院夏令营',
            sourceUrl: 'http://example.com/camp2',
            universityId,
            majorId,
            publishDate: new Date('2026-03-15'),
            deadline: new Date('2026-07-15'),
            status: 'published',
            confidence: 0.90,
        },
        {
            title: '已过期夏令营',
            sourceUrl: 'http://example.com/camp3',
            universityId,
            majorId,
            publishDate: new Date('2025-01-01'),
            deadline: new Date('2025-06-01'),
            status: 'expired',
            confidence: 0.85,
        },
        {
            title: '草稿状态夏令营',
            sourceUrl: 'http://example.com/camp4',
            universityId,
            majorId,
            publishDate: new Date('2026-04-01'),
            deadline: new Date('2026-08-01'),
            status: 'draft',
            confidence: 0.80,
        },
    ];
    const created = [];
    for (const data of camps) {
        const camp = await exports.prisma.campInfo.create({ data });
        created.push(camp);
    }
    return created;
}
async function createTestUser(openid) {
    return exports.prisma.user.create({
        data: {
            openid: openid || `test_openid_${Date.now()}`,
        },
    });
}
async function createTestReminder(userId, campId) {
    return exports.prisma.reminder.create({
        data: {
            userId,
            campId,
            remindTime: new Date('2026-06-25'),
            status: 'pending',
        },
    });
}
function generateTestToken(userId, openid) {
    return `Bearer mock_token_${userId}_${openid}`;
}
class TestDataBuilder {
    constructor() {
        this.universities = [];
        this.majors = [];
        this.camps = [];
        this.users = [];
        this.reminders = [];
    }
    async buildUniversities(count = 6) {
        this.universities = await createTestUniversities();
        return this;
    }
    async buildMajors(universityIndex = 0) {
        if (this.universities.length === 0) {
            await this.buildUniversities();
        }
        this.majors = await createTestMajors(this.universities[universityIndex].id);
        return this;
    }
    async buildCamps(universityIndex = 0, majorIndex) {
        if (this.universities.length === 0) {
            await this.buildUniversities();
        }
        const majorId = majorIndex !== undefined ? this.majors[majorIndex]?.id : undefined;
        this.camps = await createTestCamps(this.universities[universityIndex].id, majorId);
        return this;
    }
    async buildUsers(count = 1) {
        for (let i = 0; i < count; i++) {
            const user = await createTestUser(`test_openid_${i}`);
            this.users.push(user);
        }
        return this;
    }
    async buildReminders(userIndex = 0, campIndex = 0) {
        if (this.users.length === 0) {
            await this.buildUsers();
        }
        if (this.camps.length === 0) {
            await this.buildCamps();
        }
        const reminder = await createTestReminder(this.users[userIndex].id, this.camps[campIndex].id);
        this.reminders.push(reminder);
        return this;
    }
    getUniversities() {
        return this.universities;
    }
    getMajors() {
        return this.majors;
    }
    getCamps() {
        return this.camps;
    }
    getUsers() {
        return this.users;
    }
    getReminders() {
        return this.reminders;
    }
    async cleanup() {
        await cleanDatabase();
    }
}
exports.TestDataBuilder = TestDataBuilder;
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function assertPaginationMeta(meta, expected) {
    expect(meta).toHaveProperty('page', expected.page);
    expect(meta).toHaveProperty('limit', expected.limit);
    expect(meta).toHaveProperty('total', expected.total);
    expect(meta).toHaveProperty('totalPages', Math.ceil(expected.total / expected.limit));
}
function assertResponseStructure(response) {
    expect(response).toHaveProperty('status');
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(600);
}
//# sourceMappingURL=test-utils.js.map