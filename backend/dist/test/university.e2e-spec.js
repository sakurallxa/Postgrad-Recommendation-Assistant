"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/modules/prisma/prisma.service");
const university_service_1 = require("../src/modules/university/university.service");
const e2e_app_helper_1 = require("./e2e-app.helper");
describe('UniversityModule (integration)', () => {
    let app;
    let prisma;
    let universityService;
    let universityId;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = await (0, e2e_app_helper_1.createConfiguredE2EApp)(moduleFixture);
        prisma = app.get(prisma_service_1.PrismaService);
        universityService = app.get(university_service_1.UniversityService);
    });
    beforeEach(async () => {
        await prisma.reminder.deleteMany();
        await prisma.campInfo.deleteMany();
        await prisma.major.deleteMany();
        await prisma.userSelection.deleteMany();
        await prisma.user.deleteMany();
        await prisma.university.deleteMany();
        const uni = await prisma.university.create({
            data: {
                name: '清华大学',
                region: '北京',
                level: '985',
                priority: 'P0',
            },
        });
        universityId = uni.id;
        await prisma.major.create({
            data: {
                name: '计算机科学与技术',
                category: '工学',
                universityId,
            },
        });
    });
    afterAll(async () => {
        await app.close();
    });
    it('获取院校列表 - 基础查询', async () => {
        const result = await universityService.findAll({ page: 1, limit: 20 });
        expect(result.data).toHaveLength(1);
        expect(result.meta.total).toBe(1);
    });
    it('获取院校列表 - 条件筛选', async () => {
        const result = await universityService.findAll({
            page: 1,
            limit: 20,
            region: '北京',
            level: '985',
        });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('清华大学');
    });
    it('获取院校详情 - 成功', async () => {
        const result = await universityService.findOne(universityId);
        expect(result.id).toBe(universityId);
        expect(Array.isArray(result.majors)).toBe(true);
    });
    it('获取院校专业列表 - 成功', async () => {
        const result = await universityService.findMajors(universityId);
        expect(result.universityId).toBe(universityId);
        expect(result.total).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=university.e2e-spec.js.map