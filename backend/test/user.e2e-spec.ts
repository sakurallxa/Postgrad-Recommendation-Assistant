import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { UserService } from '../src/modules/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { createConfiguredE2EApp } from './e2e-app.helper';

describe('UserModule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userService: UserService;
  let jwtService: JwtService;
  let jwtGuard: JwtAuthGuard;
  let authToken: string;
  let userId: string;
  let universityId: string;
  let majorId: string;

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
    userService = app.get<UserService>(UserService);
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

    const user = await prisma.user.create({ data: { openid: 'test_openid_user' } });
    userId = user.id;

    const university = await prisma.university.create({
      data: { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
    });
    universityId = university.id;

    const major = await prisma.major.create({
      data: { name: '计算机科学与技术', category: '工学', universityId },
    });
    majorId = major.id;

    authToken = jwtService.sign({ sub: userId, openid: user.openid });
  });

  afterAll(async () => {
    await app.close();
  });

  it('获取用户信息 - 成功', async () => {
    const result = await userService.getProfile(userId);

    expect(result.id).toBe(userId);
    expect(result.selection).toBeDefined();
  });

  it('未授权请求 - JwtAuthGuard 抛出异常', async () => {
    const context = createExecutionContext({});
    await expect(jwtGuard.canActivate(context)).rejects.toThrow('未提供认证令牌');
  });

  it('更新并获取用户选择 - 成功', async () => {
    await userService.updateSelection(userId, {
      universityIds: [universityId],
      majorIds: [majorId],
    });

    const result = await userService.getSelection(userId);

    expect(result.totalUniversities).toBe(1);
    expect(result.totalMajors).toBe(1);
  });

  it('更新用户选择 - 无效院校ID抛出 404', async () => {
    const invalidUniversityId = '550e8400-e29b-41d4-a716-446655440000';

    await expect(
      userService.updateSelection(userId, { universityIds: [invalidUniversityId] }),
    ).rejects.toThrow('无效的院校ID');
  });

  it('JwtAuthGuard - 有效 token 通过', async () => {
    const context = createExecutionContext({
      authorization: `Bearer ${authToken}`,
    });

    const result = await jwtGuard.canActivate(context);
    expect(result).toBe(true);
  });
});
