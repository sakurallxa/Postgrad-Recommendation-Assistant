/**
 * 院校模块集成测试 (E2E)
 * 测试用例覆盖: TC-UNIV-001 ~ TC-UNIV-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('UniversityController (e2e)', () => {
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
    await prisma.campInfo.deleteMany();
    await prisma.major.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.university.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/universities', () => {
    it('TC-UNIV-001: 获取院校列表 - 基础查询', async () => {
      // 准备测试数据
      await prisma.university.createMany({
        data: [
          { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
          { name: '北京大学', region: '北京', level: '985', priority: 'P0' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('TC-UNIV-002: 获取院校列表 - 分页查询', async () => {
      // 准备25条测试数据
      const universities = Array(25).fill(null).map((_, i) => ({
        name: `大学${i + 1}`,
        region: '北京',
        level: '985',
        priority: 'P1',
      }));
      await prisma.university.createMany({ data: universities });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities?page=2&limit=10')
        .expect(200);

      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.limit).toBe(10);
      expect(response.body.meta.total).toBe(25);
      expect(response.body.meta.totalPages).toBe(3);
      expect(response.body.data).toHaveLength(10);
    });

    it('TC-UNIV-003: 获取院校列表 - 按地区筛选', async () => {
      await prisma.university.createMany({
        data: [
          { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
          { name: '北京大学', region: '北京', level: '985', priority: 'P0' },
          { name: '复旦大学', region: '上海', level: '985', priority: 'P0' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities?region=北京')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((univ: any) => {
        expect(univ.region).toBe('北京');
      });
    });

    it('TC-UNIV-004: 获取院校列表 - 按等级筛选', async () => {
      await prisma.university.createMany({
        data: [
          { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
          { name: '北京大学', region: '北京', level: '985', priority: 'P0' },
          { name: '普通大学', region: '其他', level: '普通', priority: 'P3' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities?level=985')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((univ: any) => {
        expect(univ.level).toBe('985');
      });
    });

    it('TC-UNIV-005: 获取院校列表 - 组合筛选', async () => {
      await prisma.university.createMany({
        data: [
          { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
          { name: '北京大学', region: '北京', level: '985', priority: 'P0' },
          { name: '复旦大学', region: '上海', level: '985', priority: 'P0' },
          { name: '普通大学', region: '北京', level: '普通', priority: 'P3' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities?region=北京&level=985')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((univ: any) => {
        expect(univ.region).toBe('北京');
        expect(univ.level).toBe('985');
      });
    });

    it('TC-UNIV-006: 获取院校列表 - 空结果', async () => {
      await prisma.university.createMany({
        data: [
          { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities?region=不存在的地区')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });

    it('应该按priority升序排列', async () => {
      await prisma.university.createMany({
        data: [
          { name: '普通大学', region: '其他', level: '普通', priority: 'P3' },
          { name: '南京大学', region: '江苏', level: '985', priority: 'P1' },
          { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/universities')
        .expect(200);

      expect(response.body.data[0].priority).toBe('P0');
      expect(response.body.data[1].priority).toBe('P1');
      expect(response.body.data[2].priority).toBe('P3');
    });
  });
});
