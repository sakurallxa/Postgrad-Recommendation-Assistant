/**
 * 认证模块集成测试 (E2E)
 * 测试用例覆盖: TC-AUTH-001 ~ TC-AUTH-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    
    await app.init();
  });

  beforeEach(async () => {
    // 清理数据
    await prisma.reminder.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/wx-login', () => {
    it('TC-AUTH-001: 微信登录 - 成功场景（新用户）', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/wx-login')
        .send({ code: 'test_code_new_user' })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('openid');
    });

    it('TC-AUTH-001: 微信登录 - 成功场景（已存在用户）', async () => {
      // 先创建用户
      const existingUser = await prisma.user.create({
        data: { openid: 'existing_openid_123' },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/wx-login')
        .send({ code: 'existing_openid_123' })
        .expect(201);

      expect(response.body.user.id).toBe(existingUser.id);
      expect(response.body.user.openid).toBe(existingUser.openid);
    });

    it('TC-AUTH-002: 微信登录 - 空code', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/wx-login')
        .send({ code: '' })
        .expect(401);

      expect(response.body.message).toContain('微信登录凭证不能为空');
    });

    it('TC-AUTH-002: 微信登录 - 缺失code字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/wx-login')
        .send({})
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('TC-AUTH-004: Token刷新 - 成功场景', async () => {
      // 先登录获取token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/wx-login')
        .send({ code: 'test_refresh_token' })
        .expect(201);

      const refreshToken = loginResponse.body.refreshToken;

      // 使用refreshToken刷新
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
    });

    it('TC-AUTH-005: Token刷新 - 无效Token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.message).toContain('令牌无效或已过期');
    });

    it('TC-AUTH-006: Token刷新 - 空Token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);

      expect(response.body.message).toContain('刷新令牌不能为空');
    });

    it('TC-AUTH-006: Token刷新 - 格式错误的Authorization头', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'invalid_format')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });
  });
});
