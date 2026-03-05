import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ProgressService } from '../src/modules/progress/progress.service';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('ProgressModule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let progressService: ProgressService;
  let userId: string;
  let campId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createConfiguredE2EApp(moduleFixture);
    prisma = app.get<PrismaService>(PrismaService);
    progressService = app.get<ProgressService>(ProgressService);
  });

  beforeEach(async () => {
    await prisma.progressMatchCandidate.deleteMany();
    await prisma.campResultEntry.deleteMany();
    await prisma.progressAlert.deleteMany();
    await prisma.progressStatusLog.deleteMany();
    await prisma.progressSubscription.deleteMany();
    await prisma.applicationProgress.deleteMany();
    await prisma.progressChangeEvent.deleteMany();
    await prisma.campWatchSubscription.deleteMany();
    await prisma.reminder.deleteMany();
    await prisma.campExtractionLog.deleteMany();
    await prisma.campSourceAlias.deleteMany();
    await prisma.campInfo.deleteMany();
    await prisma.major.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.university.deleteMany();

    const university = await prisma.university.create({
      data: { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
    });

    const major = await prisma.major.create({
      data: {
        name: '计算机科学与技术',
        category: '工学',
        universityId: university.id,
      },
    });

    const user = await prisma.user.create({
      data: { openid: `progress_test_openid_${Date.now()}` },
    });
    userId = user.id;

    const futureDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const camp = await prisma.campInfo.create({
      data: {
        title: '2026年计算机学院夏令营',
        sourceUrl: 'http://example.com/progress-camp',
        universityId: university.id,
        majorId: major.id,
        publishDate: new Date(),
        deadline: futureDeadline,
        status: 'published',
        confidence: 0.95,
      },
    });
    campId = camp.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('创建申请进展 - 成功并同步订阅/关注', async () => {
    const progress = await progressService.create(userId, {
      campId,
      status: 'followed',
      nextAction: '完善申请材料',
    });

    expect(progress.id).toBeDefined();
    expect(progress.status).toBe('followed');

    const subscription = await prisma.progressSubscription.findUnique({
      where: { progressId: progress.id },
    });
    expect(subscription).toBeDefined();
    expect(subscription?.enabled).toBe(true);

    const watchSubscription = await prisma.campWatchSubscription.findUnique({
      where: {
        userId_campId: {
          userId,
          campId,
        },
      },
    });
    expect(watchSubscription).toBeDefined();
    expect(watchSubscription?.sourceType).toBe('progress');

    const deadlineAlerts = await prisma.progressAlert.findMany({
      where: {
        userId,
        progressId: progress.id,
        type: 'deadline_stage',
      },
    });
    expect(deadlineAlerts.length).toBeGreaterThan(0);
  });

  it('更新状态 - 非法流转应抛出异常', async () => {
    const progress = await progressService.create(userId, {
      campId,
      status: 'followed',
    });

    await expect(
      progressService.updateStatus(userId, progress.id, {
        status: 'waiting_admission',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('确认进展步骤 - 可推进到 submitted', async () => {
    const progress = await progressService.create(userId, {
      campId,
      status: 'followed',
    });

    const updated = await progressService.confirmStep(userId, progress.id, {
      status: 'submitted',
      note: '已完成提交',
    });

    expect(updated.id).toBe(progress.id);
    expect(updated.status).toBe('submitted');

    const latestLog = await prisma.progressStatusLog.findFirst({
      where: { progressId: progress.id },
      orderBy: { changedAt: 'desc' },
    });
    expect(latestLog?.sourceType).toBe('confirm');
  });

  it('创建变更事件 - 应按订阅分发 change_event 提醒', async () => {
    const progress = await progressService.create(userId, {
      campId,
      status: 'followed',
    });

    const result = await progressService.createChangeEvent({
      campId,
      eventType: 'deadline',
      fieldName: 'deadline',
      oldValue: '2026-07-01',
      newValue: '2026-06-28',
      sourceType: 'crawler',
      sourceUrl: 'http://example.com/source',
      sourceUpdatedAt: new Date().toISOString(),
    });

    expect(result.event.id).toBeDefined();
    expect(result.notifiedUsers).toBeGreaterThanOrEqual(1);

    const eventAlerts = await prisma.progressAlert.findMany({
      where: {
        userId,
        progressId: progress.id,
        eventId: result.event.id,
        type: 'change_event',
        channel: 'in_app',
      },
    });
    expect(eventAlerts.length).toBeGreaterThan(0);
  });
});

