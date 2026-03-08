import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('ProgressModule HTTP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let http: request.SuperTest<request.Test>;
  let authToken: string;
  let userId: string;
  let campId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createConfiguredE2EApp(moduleFixture);
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    try {
      await app.listen(0, '127.0.0.1');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`progress-http.e2e 启动失败，无法监听本地端口: ${reason}`);
    }
    http = request(app.getHttpServer());
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
      data: { openid: `progress_http_test_${Date.now()}` },
    });
    userId = user.id;

    const camp = await prisma.campInfo.create({
      data: {
        title: '2026年计算机学院夏令营',
        sourceUrl: 'http://example.com/progress-http-camp',
        universityId: university.id,
        majorId: major.id,
        publishDate: new Date(),
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        status: 'published',
        confidence: 0.95,
      },
    });
    campId = camp.id;

    authToken = jwtService.sign({ sub: userId, openid: user.openid });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Guard: 未带 token 访问受保护接口应返回 401', async () => {
    const res = await http.get('/api/v1/progress');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1003);
  });

  it('Guard: 非法 token 应返回 401', async () => {
    const res = await http
      .get('/api/v1/progress')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1003);
  });

  it('DTO: 创建进展 campId 非 UUID 应返回 400', async () => {
    const res = await http
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        campId: 'not-uuid',
        status: 'followed',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('Pipe: 列表分页参数非数字应返回 400', async () => {
    const res = await http
      .get('/api/v1/progress?page=abc&limit=10')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('HTTP 主链路: 创建并查询进展成功', async () => {
    const createRes = await http
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        campId,
        status: 'followed',
        nextAction: '完善申请材料',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.status).toBe('followed');

    const listRes = await http
      .get('/api/v1/progress?page=1&limit=20')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('Pipe: status 更新接口 progressId 非 UUID 应返回 400', async () => {
    const res = await http
      .patch('/api/v1/progress/not-a-uuid/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'submitted' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('DTO: status 非允许值应返回 400', async () => {
    const createRes = await http
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ campId, status: 'followed' });
    const progressId = createRes.body.id;

    const res = await http
      .patch(`/api/v1/progress/${progressId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'invalid-status' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('业务校验: 非法状态流转应返回 400', async () => {
    const createRes = await http
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ campId, status: 'followed' });
    const progressId = createRes.body.id;

    const res = await http
      .patch(`/api/v1/progress/${progressId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'waiting_admission' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('HTTP 主链路: 合法状态流转与订阅更新成功', async () => {
    const createRes = await http
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ campId, status: 'followed' });
    const progressId = createRes.body.id;

    const statusRes = await http
      .patch(`/api/v1/progress/${progressId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        status: 'submitted',
        note: '已提交',
      });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('submitted');

    const subRes = await http
      .patch(`/api/v1/progress/${progressId}/subscription`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        enabled: true,
        materialsChanged: false,
      });
    expect(subRes.status).toBe(200);
    expect(subRes.body.enabled).toBe(true);
    expect(subRes.body.materialsChanged).toBe(false);
  });

  it('DTO: 创建变更事件缺少必填字段应返回 400', async () => {
    const res = await http
      .post('/api/v1/progress/events')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        campId,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('HTTP 主链路: 创建变更事件并分发提醒成功', async () => {
    await http
      .post('/api/v1/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ campId, status: 'followed' });

    const eventRes = await http
      .post('/api/v1/progress/events')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        campId,
        eventType: 'deadline',
        fieldName: 'deadline',
        oldValue: '2026-07-01',
        newValue: '2026-06-28',
        sourceType: 'crawler',
        sourceUrl: 'http://example.com/source',
        sourceUpdatedAt: new Date().toISOString(),
      });

    expect(eventRes.status).toBe(201);
    expect(eventRes.body.event.id).toBeDefined();
    expect(eventRes.body.notifiedUsers).toBeGreaterThanOrEqual(1);
  });

  it('ProgressAction DTO + 业务: consume 缺 token 返回 400，未知 token 返回 404', async () => {
    const badPayloadRes = await http
      .post('/api/v1/progress/actions/consume')
      .send({});
    expect(badPayloadRes.status).toBe(400);
    expect(badPayloadRes.body.code).toBe(1001);

    const unknownRes = await http
      .post('/api/v1/progress/actions/consume')
      .send({ token: 'token_not_exists' });
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.code).toBe(2001);
  });
});
