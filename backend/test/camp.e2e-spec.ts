import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { CampService } from '../src/modules/camp/camp.service';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('CampModule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let campService: CampService;
  let universityId: string;
  let majorId: string;
  let publishedCampId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createConfiguredE2EApp(moduleFixture);
    prisma = app.get<PrismaService>(PrismaService);
    campService = app.get<CampService>(CampService);
  });

  beforeEach(async () => {
    await prisma.reminder.deleteMany();
    await prisma.campInfo.deleteMany();
    await prisma.major.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.university.deleteMany();

    const uni = await prisma.university.create({
      data: { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
    });
    universityId = uni.id;

    const major = await prisma.major.create({
      data: { name: '计算机科学与技术', category: '工学', universityId },
    });
    majorId = major.id;

    const published = await prisma.campInfo.create({
      data: {
        title: '2026夏令营-发布',
        sourceUrl: 'http://example.com/published',
        universityId,
        majorId,
        publishDate: new Date('2026-03-01'),
        deadline: new Date('2026-06-30'),
        status: 'published',
        confidence: 0.9,
      },
    });
    publishedCampId = published.id;

    await prisma.campInfo.create({
      data: {
        title: '2026夏令营-草稿',
        sourceUrl: 'http://example.com/draft',
        universityId,
        majorId,
        publishDate: new Date('2026-03-02'),
        deadline: new Date('2026-07-01'),
        status: 'draft',
        confidence: 0.8,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('获取夏令营列表 - 仅返回 published', async () => {
    const result = await campService.findAll({ page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe('published');
  });

  it('获取夏令营列表 - 支持院校和专业筛选', async () => {
    const result = await campService.findAll({
      page: 1,
      limit: 20,
      universityId,
      majorId,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(publishedCampId);
  });

  it('获取夏令营详情 - 成功', async () => {
    const result = await campService.findOne(publishedCampId);

    expect(result.id).toBe(publishedCampId);
    expect(result.university).toBeDefined();
    expect(result.major).toBeDefined();
  });

  it('获取夏令营详情 - 不存在抛出 404', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    await expect(campService.findOne(id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
