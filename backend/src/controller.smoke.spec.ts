import { UnauthorizedException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { UniversityController } from './modules/university/university.controller';
import { CampController } from './modules/camp/camp.controller';
import { ReminderController } from './modules/reminder/reminder.controller';
import { CrawlerController } from './modules/crawler/crawler.controller';
import { UserController } from './modules/user/user.controller';
import { ProgressController } from './modules/progress/progress.controller';
import { ProgressActionController } from './modules/progress/progress-action.controller';

describe('Controller smoke', () => {
  it('HealthController returns healthy status', () => {
    const controller = new HealthController();
    const result = controller.getHealth();
    expect(result.status).toBe('healthy');
    expect(typeof result.timestamp).toBe('string');
  });

  it('AuthController delegates to service', async () => {
    const service = {
      wxLogin: jest.fn().mockResolvedValue({ accessToken: 'a' }),
      refreshToken: jest.fn().mockResolvedValue({ accessToken: 'b' }),
    };
    const controller = new AuthController(service as any);

    await controller.wxLogin({ code: 'code_1' } as any);
    expect(service.wxLogin).toHaveBeenCalledWith('code_1');

    await controller.refreshToken('Bearer refresh_1');
    expect(service.refreshToken).toHaveBeenCalledWith('refresh_1');
  });

  it('UniversityController delegates to service', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      findOne: jest.fn().mockResolvedValue({ id: 'u1' }),
      findMajors: jest.fn().mockResolvedValue([]),
    };
    const controller = new UniversityController(service as any);

    await controller.findAll({ page: 1, limit: 20 } as any);
    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });

    await controller.findOne('u1');
    expect(service.findOne).toHaveBeenCalledWith('u1');

    await controller.findMajors('u1');
    expect(service.findMajors).toHaveBeenCalledWith('u1');
  });

  it('CampController parses query params', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    const controller = new CampController(service as any);

    await controller.findAll(1, 20, 'u1', 'u2,u3', 'm1', 'published', 'summer_camp', '2026', '计算机');
    expect(service.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      universityId: 'u1',
      universityIds: ['u2', 'u3'],
      majorId: 'm1',
      status: 'published',
      announcementType: 'summer_camp',
      year: 2026,
      keyword: '计算机',
      actionableOnly: true,
      includeFramework: false,
    });

    await controller.findAll(1, 20, undefined, undefined, undefined, undefined, undefined, 'invalid');
    expect(service.findAll).toHaveBeenLastCalledWith(
      expect.objectContaining({
        year: undefined,
        actionableOnly: true,
      }),
    );

    await controller.findOne('c1');
    expect(service.findOne).toHaveBeenCalledWith('c1');
  });

  it('ReminderController delegates to service', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      remove: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new ReminderController(service as any);

    await controller.findAll('user1', 1, 20, 'pending');
    expect(service.findAll).toHaveBeenCalledWith('user1', 1, 20, 'pending');

    await controller.create('user1', { campId: 'c1' } as any);
    expect(service.create).toHaveBeenCalledWith('user1', { campId: 'c1' });

    await controller.remove('user1', 'r1');
    expect(service.remove).toHaveBeenCalledWith('user1', 'r1');
  });

  it('CrawlerController handles ingest key checks and delegates to service', async () => {
    const service = {
      trigger: jest.fn().mockResolvedValue({ taskId: 't1' }),
      getLogs: jest.fn().mockResolvedValue([]),
      getTaskStatus: jest.fn().mockResolvedValue({ status: 'done' }),
      ingestCamps: jest.fn().mockResolvedValue({ created: 1, updated: 0 }),
    };
    const controller = new CrawlerController(service as any);

    await controller.trigger(undefined, 'P1', '2');
    expect(service.trigger).toHaveBeenCalledWith(undefined, 'P1', 2);

    await controller.trigger(undefined, undefined, '0');
    expect(service.trigger).toHaveBeenLastCalledWith(undefined, undefined, 3);

    await controller.getLogs();
    expect(service.getLogs).toHaveBeenCalled();

    await controller.getTaskStatus('task-1');
    expect(service.getTaskStatus).toHaveBeenCalledWith('task-1');

    const originalKey = process.env.CRAWLER_INGEST_KEY;
    delete process.env.CRAWLER_INGEST_KEY;
    await expect(
      controller.ingestCamps('k1', { items: [] } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    process.env.CRAWLER_INGEST_KEY = 'secret';
    await expect(
      controller.ingestCamps('wrong', { items: [] } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await controller.ingestCamps('secret', { items: [], emitBaselineEvents: false } as any);
    expect(service.ingestCamps).toHaveBeenLastCalledWith([], {
      emitBaselineEvents: false,
      sourceType: 'crawler',
    });

    process.env.CRAWLER_INGEST_KEY = originalKey;
  });

  it('UserController delegates to service', async () => {
    const service = {
      getProfile: jest.fn().mockResolvedValue({ id: 'u1' }),
      getSelection: jest.fn().mockResolvedValue({ universityIds: [], majorIds: [] }),
      updateSelection: jest.fn().mockResolvedValue({ ok: true }),
      getStudentProfile: jest.fn().mockResolvedValue({}),
      updateStudentProfile: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new UserController(service as any);

    await controller.getProfile('u1');
    expect(service.getProfile).toHaveBeenCalledWith('u1');
    await controller.getSelection('u1');
    expect(service.getSelection).toHaveBeenCalledWith('u1');
    await controller.updateSelection('u1', { universityIds: [] } as any);
    expect(service.updateSelection).toHaveBeenCalledWith('u1', { universityIds: [] });
    await controller.getStudentProfile('u1');
    expect(service.getStudentProfile).toHaveBeenCalledWith('u1');
    await controller.updateStudentProfile('u1', { school: 'x' } as any);
    expect(service.updateStudentProfile).toHaveBeenCalledWith('u1', { school: 'x' });
  });

  it('ProgressController delegates all routes to service', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      unfollowByCamp: jest.fn().mockResolvedValue({ ok: true }),
      listAlerts: jest.fn().mockResolvedValue({ data: [] }),
      handleAlert: jest.fn().mockResolvedValue({ ok: true }),
      snoozeAlert: jest.fn().mockResolvedValue({ ok: true }),
      createChangeEvent: jest.fn().mockResolvedValue({ id: 'e1' }),
      getSchoolSubscriptions: jest.fn().mockResolvedValue([]),
      updateSchoolSubscription: jest.fn().mockResolvedValue({ ok: true }),
      findOne: jest.fn().mockResolvedValue({ id: 'p1' }),
      removeProgress: jest.fn().mockResolvedValue({ ok: true }),
      updateStatus: jest.fn().mockResolvedValue({ ok: true }),
      confirmStep: jest.fn().mockResolvedValue({ ok: true }),
      getSubscription: jest.fn().mockResolvedValue({}),
      updateSubscription: jest.fn().mockResolvedValue({ ok: true }),
      consumeActionToken: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new ProgressController(service as any);

    await controller.findAll('u1', 1, 20, 'pending');
    await controller.create('u1', { campId: 'c1' } as any);
    await controller.unfollowByCamp('u1', 'camp1');
    await controller.listAlerts('u1', 1, 20, 'pending');
    await controller.handleAlert('u1', 'a1');
    await controller.snoozeAlert('u1', 'a1', { hours: 4 } as any);
    await controller.createEvent({ type: 'x' } as any);
    await controller.getSchoolSubscriptions('u1');
    await controller.updateSchoolSubscription('u1', 'school1', { enabled: true } as any);
    await controller.findOne('u1', 'p1');
    await controller.remove('u1', 'p1');
    await controller.updateStatus('u1', 'p1', { status: 'active' } as any);
    await controller.confirmStep('u1', 'p1', { action: 'confirm' } as any);
    await controller.getSubscription('u1', 'p1');
    await controller.updateSubscription('u1', 'p1', { enabled: true } as any);

    expect(service.findAll).toHaveBeenCalledWith('u1', 1, 20, 'pending');
    expect(service.consumeActionToken).not.toHaveBeenCalled();
  });

  it('ProgressActionController delegates consume action', async () => {
    const service = {
      consumeActionToken: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new ProgressActionController(service as any);
    await controller.consume({ token: 't1' } as any);
    expect(service.consumeActionToken).toHaveBeenCalledWith('t1');
  });
});
