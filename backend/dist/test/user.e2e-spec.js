"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/modules/prisma/prisma.service");
const user_service_1 = require("../src/modules/user/user.service");
const jwt_1 = require("@nestjs/jwt");
const jwt_auth_guard_1 = require("../src/common/guards/jwt-auth.guard");
const e2e_app_helper_1 = require("./e2e-app.helper");
describe('UserModule (integration)', () => {
    let app;
    let prisma;
    let userService;
    let jwtService;
    let jwtGuard;
    let authToken;
    let userId;
    let universityId;
    let majorId;
    const createExecutionContext = (headers) => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ headers }),
            }),
        };
    };
    beforeAll(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = await (0, e2e_app_helper_1.createConfiguredE2EApp)(moduleFixture);
        prisma = app.get(prisma_service_1.PrismaService);
        userService = app.get(user_service_1.UserService);
        jwtService = app.get(jwt_1.JwtService);
        jwtGuard = app.get(jwt_auth_guard_1.JwtAuthGuard);
    });
    beforeEach(async () => {
        await prisma.reminder.deleteMany();
        await prisma.campInfo.deleteMany();
        await prisma.major.deleteMany();
        await prisma.userSelection.deleteMany();
        await prisma.user.deleteMany();
        await prisma.university.deleteMany();
        const user = await prisma.user.create({ data: { openid: 'test_openid_user' } });
        userId = user.id;
        const university = await prisma.university.create({
            data: { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
        });
        universityId = university.id;
        const major = await prisma.major.create({
            data: { name: '计算机科学与技术', category: '工学', universityId },
        });
        majorId = major.id;
        authToken = jwtService.sign({ sub: userId, openid: user.openid });
    });
    afterAll(async () => {
        await app.close();
    });
    it('获取用户信息 - 成功', async () => {
        const result = await userService.getProfile(userId);
        expect(result.id).toBe(userId);
        expect(result.selection).toBeDefined();
    });
    it('未授权请求 - JwtAuthGuard 抛出异常', async () => {
        const context = createExecutionContext({});
        await expect(jwtGuard.canActivate(context)).rejects.toThrow('未提供认证令牌');
    });
    it('更新并获取用户选择 - 成功', async () => {
        await userService.updateSelection(userId, {
            universityIds: [universityId],
            majorIds: [majorId],
        });
        const result = await userService.getSelection(userId);
        expect(result.totalUniversities).toBe(1);
        expect(result.totalMajors).toBe(1);
    });
    it('更新用户选择 - 无效院校ID抛出 404', async () => {
        const invalidUniversityId = '550e8400-e29b-41d4-a716-446655440000';
        await expect(userService.updateSelection(userId, { universityIds: [invalidUniversityId] })).rejects.toThrow('无效的院校ID');
    });
    it('JwtAuthGuard - 有效 token 通过', async () => {
        const context = createExecutionContext({
            authorization: `Bearer ${authToken}`,
        });
        const result = await jwtGuard.canActivate(context);
        expect(result).toBe(true);
    });
});
//# sourceMappingURL=user.e2e-spec.js.map