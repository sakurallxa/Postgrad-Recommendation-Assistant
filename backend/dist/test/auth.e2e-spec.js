"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/modules/prisma/prisma.service");
const auth_service_1 = require("../src/modules/auth/auth.service");
const e2e_app_helper_1 = require("./e2e-app.helper");
describe('AuthModule (integration)', () => {
    let app;
    let prisma;
    let authService;
    beforeAll(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
        delete process.env.WECHAT_APPID;
        delete process.env.WECHAT_SECRET;
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = await (0, e2e_app_helper_1.createConfiguredE2EApp)(moduleFixture);
        prisma = app.get(prisma_service_1.PrismaService);
        authService = app.get(auth_service_1.AuthService);
    });
    beforeEach(async () => {
        await prisma.reminder.deleteMany();
        await prisma.userSelection.deleteMany();
        await prisma.user.deleteMany();
    });
    afterAll(async () => {
        await app.close();
    });
    it('微信登录 - 新用户成功', async () => {
        const result = await authService.wxLogin('new_user_code');
        expect(result.user).toBeDefined();
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.user.openid).toBe('mock_openid_new_user_code');
    });
    it('微信登录 - 已存在用户返回同一用户', async () => {
        const code = 'existing_user_code';
        const openid = `mock_openid_${code}`;
        const existing = await prisma.user.create({ data: { openid } });
        const result = await authService.wxLogin(code);
        expect(result.user.id).toBe(existing.id);
        expect(result.user.openid).toBe(openid);
    });
    it('微信登录 - 缺少 code 抛出 401', async () => {
        await expect(authService.wxLogin('')).rejects.toBeInstanceOf(common_1.UnauthorizedException);
    });
    it('刷新 token - 成功', async () => {
        const login = await authService.wxLogin('refresh_ok');
        const result = await authService.refreshToken(login.refreshToken);
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
    });
    it('刷新 token - 无 token 抛出 401', async () => {
        await expect(authService.refreshToken('')).rejects.toBeInstanceOf(common_1.UnauthorizedException);
    });
});
//# sourceMappingURL=auth.e2e-spec.js.map