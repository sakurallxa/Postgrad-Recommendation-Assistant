/**
 * 夏令营模块集成测试 (E2E)
 * 测试用例覆盖: TC-CAMP-001 ~ TC-CAMP-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('CampController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUniversity: any;
  let testMajor: any;

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

    // 创建测试数据
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

    // 创建夏令营数据
    await prisma.campInfo.createMany({
      data: [
        {
          title: '2026年计算机学院夏令营',
          sourceUrl: 'http://example.com/camp1',
          universityId: testUniversity.id,
          majorId: testMajor.id,
          publishDate: new Date('2026-03-01'),
          deadline: new Date('2026-06-30'),
          status: 'published',
          confidence: 0.95,
        },
        {
          title: '2026年软件学院夏令营',
          sourceUrl: 'http://example.com/camp2',
          universityId: testUniversity.id,
          majorId: testMajor.id,
          publishDate: new Date('2026-03-15'),
          deadline: new Date('2026-07-15'),
          status: 'published',
          confidence: 0.90,
        },
        {
          title: '已过期夏令营',
          sourceUrl: 'http://example.com/camp3',
          universityId: testUniversity.id,
          majorId: testMajor.id,
          publishDate: new Date('2025-01-01'),
          deadline: new Date('2025-06-01'),
          status: 'expired',
          confidence: 0.85,
        },
        {
          title: '草稿状态夏令营',
          sourceUrl: 'http://example.com/camp4',
          universityId: testUniversity.id,
          majorId: testMajor.id,
          publishDate: new Date('2026-04-01'),
          deadline: new Date('2026-08-01'),
          status: 'draft',
          confidence: 0.80,
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/camps', () => {
    it('TC-CAMP-001: 获取夏令营列表 - 基础查询', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/camps')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      // 只返回published状态的夏令营
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('TC-CAMP-002: 获取夏令营列表 - 按院校筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/camps?universityId=${testUniversity.id}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((camp: any) => {
        expect(camp.universityId).toBe(testUniversity.id);
      });
    });

    it('TC-CAMP-003: 获取夏令营列表 - 按专业筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/camps?majorId=${testMajor.id}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((camp: any) => {
        expect(camp.majorId).toBe(testMajor.id);
      });
    });

    it('TC-CAMP-004: 获取夏令营列表 - 组合筛选', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/camps?universityId=${testUniversity.id}&majorId=${testMajor.id}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((camp: any) => {
        expect(camp.universityId).toBe(testUniversity.id);
        expect(camp.majorId).toBe(testMajor.id);
      });
    });

    it('TC-CAMP-005: 获取夏令营列表 - 分页边界', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/camps?page=999&limit=20')
        .expect(200);

      expect(response.body.meta.page).toBe(999);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.totalPages).toBe(1);
    });

    it('TC-CAMP-006: 获取夏令营列表 - 数据关联验证', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/camps')
        .expect(200);

      expect(response.body.data[0]).toHaveProperty('university');
      expect(response.body.data[0].university).toHaveProperty('id');
      expect(response.body.data[0].university).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('major');
      expect(response.body.data[0].major).toHaveProperty('id');
      expect(response.body.data[0].major).toHaveProperty('name');
    });

    it('应该只返回published状态的夏令营', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/camps')
        .expect(200);

      response.body.data.forEach((camp: any) => {
        expect(camp.status).toBe('published');
      });
    });

    it('应该按publishDate降序排列', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/camps')
        .expect(200);

      const dates = response.body.data.map((camp: any) => new Date(camp.publishDate));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    it('空结果应该返回空数组', async () => {
      // 创建新的院校和专业，但没有关联的夏令营
      const newUniversity = await prisma.university.create({
        data: {
          name: '新大学',
          region: '新地区',
          level: '普通',
          priority: 'P3',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/camps?universityId=${newUniversity.id}`)
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });
  });
});
