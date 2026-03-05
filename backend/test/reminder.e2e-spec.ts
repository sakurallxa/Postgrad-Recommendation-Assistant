import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ReminderService } from '../src/modules/reminder/reminder.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('ReminderModule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminderService: ReminderService;
  let jwtService: JwtService;
  let jwtGuard: JwtAuthGuard;
  let authToken: string;
  let userId: string;
  let campId: string;

  const createExecutionContext = (headers: Record<string, string>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as ExecutionContext;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createConfiguredE2EApp(moduleFixture);
    prisma = app.get<PrismaService>(PrismaService);
    reminderService = app.get<ReminderService>(ReminderService);
    jwtService = app.get<JwtService>(JwtService);
    jwtGuard = app.get<JwtAuthGuard>(JwtAuthGuard);
  });

  beforeEach(async () => {
    await prisma.reminder.deleteMany();
    await prisma.campInfo.deleteMany();
    await prisma.major.deleteMany();
    await prisma.userSelection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.university.deleteMany();

    const university = await prisma.university.create({
      data: { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
    });

    const major = await prisma.major.create({
      data: { name: '计算机科学与技术', category: '工学', universityId: university.id },
    });

    const user = await prisma.user.create({
      data: { openid: 'reminder_test_openid' },
    });
    userId = user.id;

    const camp = await prisma.campInfo.create({
      data: {
        title: '2026年计算机学院夏令营',
        sourceUrl: 'http://example.com/camp1',
        universityId: university.id,
        majorId: major.id,
        publishDate: new Date('2026-03-01'),
        deadline: new Date('2026-06-30'),
        status: 'published',
        confidence: 0.95,
      },
    });
    campId = camp.id;

    authToken = jwtService.sign({ sub: user.id, openid: user.openid });
  });

  afterAll(async () => {
    await app.close();
  });

  it('创建提醒 - 成功', async () => {
    const result = await reminderService.create(userId, {
      campId,
      remindTime: '2026-06-25T00:00:00.000Z',
    });

    expect(result.id).toBeDefined();
    expect(result.userId).toBe(userId);
    expect(result.campId).toBe(campId);
  });

  it('创建提醒 - 传入 content 也应成功（兼容字段）', async () => {
    const result = await reminderService.create(userId, {
      campId,
      remindTime: '2026-06-25T00:00:00.000Z',
      content: '请在截止前完成提交',
    });

    expect(result.id).toBeDefined();
    expect(result.userId).toBe(userId);
    expect(result.campId).toBe(campId);
  });

  it('获取提醒列表 - 返回分页结构', async () => {
    await prisma.reminder.create({
      data: {
        userId,
        campId,
        remindTime: new Date('2026-06-25T00:00:00.000Z'),
        status: 'pending',
      },
    });

    const result = await reminderService.findAll(userId, 1, 20);

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.meta).toBeDefined();
    expect(result.meta.total).toBe(1);
  });

  it('删除提醒 - 成功', async () => {
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        campId,
        remindTime: new Date('2026-06-25T00:00:00.000Z'),
        status: 'pending',
      },
    });

    await reminderService.remove(userId, reminder.id);

    const deletedReminder = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(deletedReminder).toBeNull();
  });

  it('未授权请求 - JwtAuthGuard 抛出异常', async () => {
    const context = createExecutionContext({});
    await expect(jwtGuard.canActivate(context)).rejects.toThrow('未提供认证令牌');
  });
});
