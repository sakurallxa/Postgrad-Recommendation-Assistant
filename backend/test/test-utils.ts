/**
 * 测试工具函数
 * 提供测试数据生成、数据库清理等辅助功能
 */

import { PrismaClient } from '@prisma/client';

// 创建测试专用的Prisma客户端
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./test.db',
    },
  },
});

/**
 * 清理测试数据库
 * 按依赖关系顺序删除所有数据
 */
export async function cleanDatabase() {
  const tables = [
    'reminders',
    'camp_infos',
    'user_selections',
    'users',
    'majors',
    'universities',
    'crawler_logs',
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
    } catch (error) {
      // 表可能不存在，忽略错误
    }
  }
}

/**
 * 创建测试院校数据
 */
export async function createTestUniversities() {
  const universities = [
    { name: '清华大学', region: '北京', level: '985', priority: 'P0' },
    { name: '北京大学', region: '北京', level: '985', priority: 'P0' },
    { name: '复旦大学', region: '上海', level: '985', priority: 'P0' },
    { name: '上海交通大学', region: '上海', level: '985', priority: 'P0' },
    { name: '南京大学', region: '江苏', level: '985', priority: 'P1' },
    { name: '普通大学', region: '其他', level: '普通', priority: 'P3' },
  ];

  const created = [];
  for (const data of universities) {
    const univ = await prisma.university.create({ data });
    created.push(univ);
  }
  return created;
}

/**
 * 创建测试专业数据
 */
export async function createTestMajors(universityId: string) {
  const majors = [
    { name: '计算机科学与技术', category: '工学', universityId },
    { name: '软件工程', category: '工学', universityId },
    { name: '人工智能', category: '工学', universityId },
    { name: '金融学', category: '经济学', universityId },
    { name: '法学', category: '法学', universityId },
  ];

  const created = [];
  for (const data of majors) {
    const major = await prisma.major.create({ data });
    created.push(major);
  }
  return created;
}

/**
 * 创建测试夏令营数据
 */
export async function createTestCamps(universityId: string, majorId?: string) {
  const camps = [
    {
      title: '2026年计算机学院夏令营',
      sourceUrl: 'http://example.com/camp1',
      universityId,
      majorId,
      publishDate: new Date('2026-03-01'),
      deadline: new Date('2026-06-30'),
      status: 'published',
      confidence: 0.95,
    },
    {
      title: '2026年软件学院夏令营',
      sourceUrl: 'http://example.com/camp2',
      universityId,
      majorId,
      publishDate: new Date('2026-03-15'),
      deadline: new Date('2026-07-15'),
      status: 'published',
      confidence: 0.90,
    },
    {
      title: '已过期夏令营',
      sourceUrl: 'http://example.com/camp3',
      universityId,
      majorId,
      publishDate: new Date('2025-01-01'),
      deadline: new Date('2025-06-01'),
      status: 'expired',
      confidence: 0.85,
    },
    {
      title: '草稿状态夏令营',
      sourceUrl: 'http://example.com/camp4',
      universityId,
      majorId,
      publishDate: new Date('2026-04-01'),
      deadline: new Date('2026-08-01'),
      status: 'draft',
      confidence: 0.80,
    },
  ];

  const created = [];
  for (const data of camps) {
    const camp = await prisma.campInfo.create({ data });
    created.push(camp);
  }
  return created;
}

/**
 * 创建测试用户
 */
export async function createTestUser(openid?: string) {
  return prisma.user.create({
    data: {
      openid: openid || `test_openid_${Date.now()}`,
    },
  });
}

/**
 * 创建测试提醒
 */
export async function createTestReminder(userId: string, campId: string) {
  return prisma.reminder.create({
    data: {
      userId,
      campId,
      remindTime: new Date('2026-06-25'),
      status: 'pending',
    },
  });
}

/**
 * 生成有效的JWT Token（用于测试）
 */
export function generateTestToken(userId: string, openid: string): string {
  // 这是一个模拟的token，实际测试中应该使用真实的JWT生成逻辑
  return `Bearer mock_token_${userId}_${openid}`;
}

/**
 * 测试数据构建器
 */
export class TestDataBuilder {
  private universities: any[] = [];
  private majors: any[] = [];
  private camps: any[] = [];
  private users: any[] = [];
  private reminders: any[] = [];

  async buildUniversities(count: number = 6) {
    this.universities = await createTestUniversities();
    return this;
  }

  async buildMajors(universityIndex: number = 0) {
    if (this.universities.length === 0) {
      await this.buildUniversities();
    }
    this.majors = await createTestMajors(this.universities[universityIndex].id);
    return this;
  }

  async buildCamps(universityIndex: number = 0, majorIndex?: number) {
    if (this.universities.length === 0) {
      await this.buildUniversities();
    }
    const majorId = majorIndex !== undefined ? this.majors[majorIndex]?.id : undefined;
    this.camps = await createTestCamps(this.universities[universityIndex].id, majorId);
    return this;
  }

  async buildUsers(count: number = 1) {
    for (let i = 0; i < count; i++) {
      const user = await createTestUser(`test_openid_${i}`);
      this.users.push(user);
    }
    return this;
  }

  async buildReminders(userIndex: number = 0, campIndex: number = 0) {
    if (this.users.length === 0) {
      await this.buildUsers();
    }
    if (this.camps.length === 0) {
      await this.buildCamps();
    }
    const reminder = await createTestReminder(
      this.users[userIndex].id,
      this.camps[campIndex].id
    );
    this.reminders.push(reminder);
    return this;
  }

  getUniversities() {
    return this.universities;
  }

  getMajors() {
    return this.majors;
  }

  getCamps() {
    return this.camps;
  }

  getUsers() {
    return this.users;
  }

  getReminders() {
    return this.reminders;
  }

  async cleanup() {
    await cleanDatabase();
  }
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 断言辅助函数
 */
export function assertPaginationMeta(
  meta: any,
  expected: { page: number; limit: number; total: number }
) {
  expect(meta).toHaveProperty('page', expected.page);
  expect(meta).toHaveProperty('limit', expected.limit);
  expect(meta).toHaveProperty('total', expected.total);
  expect(meta).toHaveProperty('totalPages', Math.ceil(expected.total / expected.limit));
}

/**
 * 验证响应结构
 */
export function assertResponseStructure(response: any) {
  expect(response).toHaveProperty('status');
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(600);
}
