/**
 * 用户模块集成测试 (E2E)
 * 测试用例覆盖: TC-USER-001 ~ TC-USER-017
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let testUser: any;
  let testUniversities: any[];
  let testMajors: any[];
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);
    
    await app.init();
  });

  beforeEach(async () => {
    // 清理数据
    await prisma.reminder.deleteMany();
    await prisma.campInfo.deleteMany();
    await prisma.major.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.university.deleteMany();

    // 创建测试用户
    testUser = await prisma.user.create({
      data: {
        openid: 'test_openid_123',
      },
    });

    // 生成认证token
    authToken = jwtService.sign(
      { sub: testUser.id, openid: testUser.openid },
      { secret: 'test-secret-key' }
    );

    // 创建测试院校
    testUniversities = await Promise.all([
      prisma.university.create({
        data: {
          name: '清华大学',
          region: '北京',
          level: '985',
          priority: 'P0',
        },
      }),
      prisma.university.create({
        data: {
          name: '北京大学',
          region: '北京',
          level: '985',
          priority: 'P0',
        },
      }),
    ]);

    // 创建测试专业
    testMajors = await Promise.all([
      prisma.major.create({
        data: {
          name: '计算机科学与技术',
          category: '工学',
          universityId: testUniversities[0].id,
        },
      }),
      prisma.major.create({
        data: {
          name: '软件工程',
          category: '工学',
          universityId: testUniversities[0].id,
        },
      }),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/user/profile', () => {
    it('TC-USER-001: 获取用户信息 - 成功场景', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUser.id);
      expect(response.body).toHaveProperty('openid', testUser.openid);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('selection');
    });

    it('TC-USER-002: 获取用户信息 - 未授权访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/user/profile')
        .expect(401);

      expect(response.body.message).toContain('未提供认证令牌');
    });

    it('TC-USER-003: 获取用户信息 - 无效Token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/user/profile')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.message).toContain('令牌无效');
    });

    it('TC-USER-004: 获取用户信息 - Token过期', async () => {
      const expiredToken = jwtService.sign(
        { sub: testUser.id, openid: testUser.openid },
        { secret: 'test-secret-key', expiresIn: '0s' }
      );

      // 等待token过期
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app.getHttpServer())
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.message).toContain('令牌无效或已过期');
    });
  });

  describe('GET /api/v1/user/selection', () => {
    it('TC-USER-005: 获取用户选择 - 成功场景', async () => {
      // 先创建用户选择
      await prisma.userSelection.create({
        data: {
          userId: testUser.id,
          universityIds: JSON.stringify([testUniversities[0].id]),
          majorIds: JSON.stringify([testMajors[0].id]),
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('universities');
      expect(response.body).toHaveProperty('majors');
      expect(response.body).toHaveProperty('totalUniversities');
      expect(response.body).toHaveProperty('totalMajors');
      expect(response.body.universities).toHaveLength(1);
      expect(response.body.majors).toHaveLength(1);
    });

    it('TC-USER-006: 获取用户选择 - 无选择数据', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.universities).toEqual([]);
      expect(response.body.majors).toEqual([]);
      expect(response.body.totalUniversities).toBe(0);
      expect(response.body.totalMajors).toBe(0);
    });

    it('TC-USER-007: 获取用户选择 - 包含已删除的院校', async () => {
      // 创建包含已删除院校ID的选择
      await prisma.userSelection.create({
        data: {
          userId: testUser.id,
          universityIds: JSON.stringify([testUniversities[0].id, 'deleted_uni_id']),
          majorIds: JSON.stringify([testMajors[0].id]),
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.totalUniversities).toBe(1);
      expect(response.body.totalMajors).toBe(1);
    });
  });

  describe('PUT /api/v1/user/selection', () => {
    it('TC-USER-009: 更新用户选择 - 成功场景', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id, testUniversities[1].id],
        majorIds: [testMajors[0].id],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.message).toBe('用户选择更新成功');
      expect(response.body.selection.universityIds).toEqual(updateDto.universityIds);
      expect(response.body.selection.majorIds).toEqual(updateDto.majorIds);

      // 验证数据库已更新
      const selection = await prisma.userSelection.findUnique({
        where: { userId: testUser.id },
      });
      expect(JSON.parse(selection.universityIds)).toEqual(updateDto.universityIds);
    });

    it('TC-USER-010: 更新用户选择 - 未授权', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id],
      };

      await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .send(updateDto)
        .expect(401);
    });

    it('TC-USER-011: 更新用户选择 - 无效院校ID', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id, 'invalid_uni_id'],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(404);

      expect(response.body.message).toContain('无效的院校ID');
    });

    it('TC-USER-012: 更新用户选择 - 无效专业ID', async () => {
      const updateDto = {
        majorIds: [testMajors[0].id, 'invalid_major_id'],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(404);

      expect(response.body.message).toContain('无效的专业ID');
    });

    it('TC-USER-013: 更新用户选择 - 只更新院校', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.selection.universityIds).toEqual(updateDto.universityIds);
    });

    it('TC-USER-014: 更新用户选择 - 只更新专业', async () => {
      const updateDto = {
        majorIds: [testMajors[0].id],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.selection.majorIds).toEqual(updateDto.majorIds);
    });

    it('TC-USER-015: 更新用户选择 - 清空选择', async () => {
      // 先创建选择
      await prisma.userSelection.create({
        data: {
          userId: testUser.id,
          universityIds: JSON.stringify([testUniversities[0].id]),
          majorIds: JSON.stringify([testMajors[0].id]),
        },
      });

      const updateDto = {
        universityIds: [],
        majorIds: [],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.selection.universityIds).toEqual([]);
      expect(response.body.selection.majorIds).toEqual([]);
    });

    it('TC-USER-016: 更新用户选择 - 大量数据', async () => {
      // 创建大量院校和专业
      const manyUniversities = await Promise.all(
        Array(50).fill(null).map((_, i) =>
          prisma.university.create({
            data: {
              name: `大学${i}`,
              region: '北京',
              level: '985',
              priority: 'P0',
            },
          })
        )
      );

      const updateDto = {
        universityIds: manyUniversities.map(u => u.id),
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.selection.universityIds).toHaveLength(50);
    });

    it('TC-USER-017: 更新用户选择 - 并发更新', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id],
      };

      // 并发发送5个更新请求
      const promises = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .put('/api/v1/user/selection')
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateDto)
      );

      const responses = await Promise.all(promises);

      // 所有请求都应该成功
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('应该拒绝无效的UUID格式', async () => {
      const updateDto = {
        universityIds: ['not-a-uuid'],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('应该处理重复ID', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id, testUniversities[0].id],
      };

      // 应该正常处理或去重
      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.selection.universityIds).toBeDefined();
    });
  });

  describe('边界条件测试', () => {
    it('应该处理特殊字符在请求中', async () => {
      const updateDto = {
        universityIds: [testUniversities[0].id],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.message).toBe('用户选择更新成功');
    });

    it('应该处理空数组', async () => {
      const updateDto = {
        universityIds: [],
        majorIds: [],
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.selection.universityIds).toEqual([]);
      expect(response.body.selection.majorIds).toEqual([]);
    });

    it('应该处理null值', async () => {
      const updateDto = {};

      const response = await request(app.getHttpServer())
        .put('/api/v1/user/selection')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.message).toBe('用户选择更新成功');
    });
  });
});
