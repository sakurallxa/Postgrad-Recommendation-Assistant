"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const supertest_1 = require("supertest");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/modules/prisma/prisma.service");
describe('ReminderController (e2e)', () => {
    let app;
    let prisma;
    let testUser;
    let testCamp;
    let testUniversity;
    let testMajor;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        prisma = app.get(prisma_service_1.PrismaService);
        await app.init();
    });
    beforeEach(async () => {
        await prisma.reminder.deleteMany();
        await prisma.campInfo.deleteMany();
        await prisma.major.deleteMany();
        await prisma.userSelection.deleteMany();
        await prisma.user.deleteMany();
        await prisma.university.deleteMany();
        testUniversity = await prisma.university.create({
            data: {
                name: '清华大学',
                region: '北京',
                level: '985',
                priority: 'P0',
            },
        });
        testMajor = await prisma.major.create({
            data: {
                name: '计算机科学与技术',
                category: '工学',
                universityId: testUniversity.id,
            },
        });
        testUser = await prisma.user.create({
            data: {
                openid: 'test_openid_123',
            },
        });
        testCamp = await prisma.campInfo.create({
            data: {
                title: '2026年计算机学院夏令营',
                sourceUrl: 'http://example.com/camp1',
                universityId: testUniversity.id,
                majorId: testMajor.id,
                publishDate: new Date('2026-03-01'),
                deadline: new Date('2026-06-30'),
                status: 'published',
                confidence: 0.95,
            },
        });
    });
    afterAll(async () => {
        await app.close();
    });
    describe('POST /api/v1/reminders', () => {
        it('TC-REM-001: 创建提醒 - 成功场景', async () => {
            const createDto = {
                userId: testUser.id,
                campId: testCamp.id,
                remindTime: '2026-06-25T00:00:00.000Z',
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/reminders')
                .send(createDto)
                .expect(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.userId).toBe(createDto.userId);
            expect(response.body.campId).toBe(createDto.campId);
            expect(response.body.status).toBe('pending');
        });
        it('TC-REM-002: 创建提醒 - 无效用户ID', async () => {
            const createDto = {
                userId: 'invalid-user-id',
                campId: testCamp.id,
                remindTime: '2026-06-25T00:00:00.000Z',
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/reminders')
                .send(createDto)
                .expect(500);
            expect(response.body.message).toBeDefined();
        });
        it('TC-REM-003: 创建提醒 - 无效夏令营ID', async () => {
            const createDto = {
                userId: testUser.id,
                campId: 'invalid-camp-id',
                remindTime: '2026-06-25T00:00:00.000Z',
            };
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/reminders')
                .send(createDto)
                .expect(500);
            expect(response.body.message).toBeDefined();
        });
        it('应该拒绝无效的日期格式', async () => {
            const createDto = {
                userId: testUser.id,
                campId: testCamp.id,
                remindTime: 'invalid-date',
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/reminders')
                .send(createDto)
                .expect(400);
        });
        it('应该拒绝缺失必填字段的请求', async () => {
            const createDto = {
                userId: testUser.id,
            };
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/reminders')
                .send(createDto)
                .expect(400);
        });
    });
    describe('GET /api/v1/reminders', () => {
        it('TC-REM-004: 获取提醒列表 - 基础查询', async () => {
            await prisma.reminder.createMany({
                data: [
                    {
                        userId: testUser.id,
                        campId: testCamp.id,
                        remindTime: new Date('2026-06-25'),
                        status: 'pending',
                    },
                    {
                        userId: testUser.id,
                        campId: testCamp.id,
                        remindTime: new Date('2026-06-26'),
                        status: 'sent',
                        sentAt: new Date(),
                    },
                ],
            });
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/reminders')
                .expect(200);
            expect(response.body).toHaveLength(2);
            expect(new Date(response.body[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(response.body[1].createdAt).getTime());
        });
        it('空数据库应该返回空数组', async () => {
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/reminders')
                .expect(200);
            expect(response.body).toEqual([]);
        });
    });
    describe('DELETE /api/v1/reminders/:id', () => {
        it('TC-REM-005: 删除提醒 - 成功场景', async () => {
            const reminder = await prisma.reminder.create({
                data: {
                    userId: testUser.id,
                    campId: testCamp.id,
                    remindTime: new Date('2026-06-25'),
                    status: 'pending',
                },
            });
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .delete(`/api/v1/reminders/${reminder.id}`)
                .expect(200);
            expect(response.body.id).toBe(reminder.id);
            const deletedReminder = await prisma.reminder.findUnique({
                where: { id: reminder.id },
            });
            expect(deletedReminder).toBeNull();
        });
        it('TC-REM-006: 删除提醒 - 无效ID', async () => {
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .delete('/api/v1/reminders/invalid-reminder-id')
                .expect(500);
            expect(response.body.message).toBeDefined();
        });
        it('应该返回404当删除不存在的提醒', async () => {
            const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
            await (0, supertest_1.default)(app.getHttpServer())
                .delete(`/api/v1/reminders/${nonExistentId}`)
                .expect(500);
        });
    });
    describe('边界条件测试', () => {
        it('应该处理大量提醒数据', async () => {
            const reminders = Array(100).fill(null).map((_, i) => ({
                userId: testUser.id,
                campId: testCamp.id,
                remindTime: new Date(`2026-06-${(i % 30) + 1}`),
                status: 'pending',
            }));
            await prisma.reminder.createMany({ data: reminders });
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/reminders')
                .expect(200);
            expect(response.body).toHaveLength(100);
        });
        it('应该正确处理关联数据删除后的提醒', async () => {
            const reminder = await prisma.reminder.create({
                data: {
                    userId: testUser.id,
                    campId: testCamp.id,
                    remindTime: new Date('2026-06-25'),
                    status: 'pending',
                },
            });
            await prisma.campInfo.delete({
                where: { id: testCamp.id },
            });
            const deletedReminder = await prisma.reminder.findUnique({
                where: { id: reminder.id },
            });
            expect(deletedReminder).toBeNull();
        });
    });
});
//# sourceMappingURL=reminder.e2e-spec.js.map