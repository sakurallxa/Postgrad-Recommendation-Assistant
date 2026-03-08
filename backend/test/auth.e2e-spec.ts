import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('AuthModule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let originalEnv: Record<string, string | undefined>;

  beforeAll(async () => {
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      ALLOW_MOCK_WECHAT_LOGIN: process.env.ALLOW_MOCK_WECHAT_LOGIN,
      WECHAT_APPID: process.env.WECHAT_APPID,
      WECHAT_SECRET: process.env.WECHAT_SECRET,
    };

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
    process.env.ALLOW_MOCK_WECHAT_LOGIN = 'true';
    process.env.WECHAT_APPID = 'wx_appid_placeholder';
    process.env.WECHAT_SECRET = 'test-wechat-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createConfiguredE2EApp(moduleFixture);
    prisma = app.get<PrismaService>(PrismaService);
    authService = app.get<AuthService>(AuthService);
  });

  beforeEach(async () => {
    await prisma.reminder.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('微信登录 - 新用户成功', async () => {
    const result = await authService.wxLogin('new_user_code');

    expect(result.user).toBeDefined();
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    // openid不再返回给客户端
    expect(result.user.id).toBeDefined();
  });

  it('微信登录 - 已存在用户返回同一用户', async () => {
    const code = 'existing_user_code';
    const openid = `mock_openid_${code}`;
    const existing = await prisma.user.create({ data: { openid } });

    const result = await authService.wxLogin(code);

    expect(result.user.id).toBe(existing.id);
    // openid不再返回给客户端
  });

  it('微信登录 - 缺少 code 抛出 401', async () => {
    await expect(authService.wxLogin('')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('刷新 token - 成功', async () => {
    const login = await authService.wxLogin('refresh_ok');
    const result = await authService.refreshToken(login.refreshToken);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('刷新 token - 无 token 抛出 401', async () => {
    await expect(authService.refreshToken('')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
