/**
 * 院校服务单元测试
 * 测试用例覆盖: TC-UNIV-001 ~ TC-UNIV-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UniversityService } from './university.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';

describe('UniversityService', () => {
  let service: UniversityService;
  let prismaService: PrismaService;

  // 模拟Prisma服务
  const mockPrismaService = {
    university: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  // 模拟Redis服务
  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UniversityService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<UniversityService>(UniversityService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('获取院校列表', () => {
    it('TC-UNIV-001: 获取院校列表 - 基础查询', async () => {
      const mockUniversities = [
        { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 10, campInfos: 5 } },
        { id: '2', name: '北京大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 8, campInfos: 3 } },
      ];

      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.university.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('TC-UNIV-002: 获取院校列表 - 分页查询', async () => {
      const mockUniversities = Array(10).fill(null).map((_, i) => ({
        id: `${i + 11}`,
        name: `大学${i + 11}`,
        region: '北京',
        level: '985',
        priority: 'P1',
        _count: { majors: 5, campInfos: 2 },
      }));

      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.university.count.mockResolvedValue(100);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBe(100);
      expect(result.meta.totalPages).toBe(10);
      expect(result.data).toHaveLength(10);
    });

    it('TC-UNIV-003: 获取院校列表 - 按地区筛选', async () => {
      const mockUniversities = [
        { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 10, campInfos: 5 } },
        { id: '2', name: '北京大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 8, campInfos: 3 } },
      ];

      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.university.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20, region: '北京' });

      expect(result.data).toHaveLength(2);
    });

    it('TC-UNIV-004: 获取院校列表 - 按等级筛选', async () => {
      const mockUniversities = [
        { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 10, campInfos: 5 } },
        { id: '2', name: '北京大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 8, campInfos: 3 } },
      ];

      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.university.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20, level: '985' });

      expect(result.data).toHaveLength(2);
    });

    it('TC-UNIV-005: 获取院校列表 - 组合筛选', async () => {
      const mockUniversities = [
        { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 10, campInfos: 5 } },
      ];

      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.university.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        region: '北京',
        level: '985',
      });

      expect(result.data).toHaveLength(1);
    });

    it('TC-UNIV-006: 获取院校列表 - 空结果', async () => {
      mockPrismaService.university.findMany.mockResolvedValue([]);
      mockPrismaService.university.count.mockResolvedValue(0);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        region: '不存在的地区',
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('分页边界测试 - 第1页', async () => {
      mockPrismaService.university.findMany.mockResolvedValue([]);
      mockPrismaService.university.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrismaService.university.findMany).toHaveBeenCalled();
    });

    it('分页边界测试 - 大页码', async () => {
      mockPrismaService.university.findMany.mockResolvedValue([]);
      mockPrismaService.university.count.mockResolvedValue(100);

      const result = await service.findAll({ page: 999, limit: 20 });

      expect(result.meta.page).toBe(999);
      expect(result.data).toEqual([]);
    });

    it('应该正确处理Promise.all', async () => {
      const mockUniversities = [
        { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0', _count: { majors: 10, campInfos: 5 } },
      ];

      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.university.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(mockPrismaService.university.findMany).toHaveBeenCalled();
      expect(mockPrismaService.university.count).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });
  });
});
