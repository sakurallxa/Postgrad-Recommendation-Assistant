import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { UniversityService } from '../src/modules/university/university.service';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('UniversityModule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let universityService: UniversityService;
  let universityId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createConfiguredE2EApp(moduleFixture);
    prisma = app.get<PrismaService>(PrismaService);
    universityService = app.get<UniversityService>(UniversityService);
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
