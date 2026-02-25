/**
 * 夏令营服务单元测试
 * 测试用例覆盖: TC-CAMP-001 ~ TC-CAMP-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CampService } from './camp.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CampService', () => {
  let service: CampService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    campInfo: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CampService>(CampService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('获取夏令营列表', () => {
    it('TC-CAMP-001: 获取夏令营列表 - 基础查询', async () => {
      const mockCamps = [
        {
          id: '1',
          title: '2026年计算机学院夏令营',
          sourceUrl: 'http://example.com/camp1',
          university: { id: 'u1', name: '清华大学' },
          major: { id: 'm1', name: '计算机科学与技术' },
          status: 'published',
          confidence: 0.95,
        },
        {
          id: '2',
          title: '2026年软件学院夏令营',
          sourceUrl: 'http://example.com/camp2',
          university: { id: 'u1', name: '清华大学' },
          major: { id: 'm2', name: '软件工程' },
          status: 'published',
          confidence: 0.90,
        },
      ];

      mockPrismaService.campInfo.findMany.mockResolvedValue(mockCamps);
      mockPrismaService.campInfo.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toEqual(mockCamps);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      // 验证只查询published状态的夏令营
      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith({
        where: { status: 'published' },
        skip: 0,
        take: 20,
        orderBy: { publishDate: 'desc' },
        include: {
          university: true,
          major: true,
        },
      });
    });

    it('TC-CAMP-002: 获取夏令营列表 - 按院校筛选', async () => {
      const universityId = 'u1';
      const mockCamps = [
        {
          id: '1',
          title: '2026年计算机学院夏令营',
          sourceUrl: 'http://example.com/camp1',
          university: { id: universityId, name: '清华大学' },
          major: { id: 'm1', name: '计算机科学与技术' },
          status: 'published',
          confidence: 0.95,
        },
      ];

      mockPrismaService.campInfo.findMany.mockResolvedValue(mockCamps);
      mockPrismaService.campInfo.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        universityId,
      });

      expect(result.data).toEqual(mockCamps);
      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith({
        where: { status: 'published', universityId },
        skip: 0,
        take: 20,
        orderBy: { publishDate: 'desc' },
        include: {
          university: true,
          major: true,
        },
      });
    });

    it('TC-CAMP-003: 获取夏令营列表 - 按专业筛选', async () => {
      const majorId = 'm1';
      const mockCamps = [
        {
          id: '1',
          title: '2026年计算机学院夏令营',
          sourceUrl: 'http://example.com/camp1',
          university: { id: 'u1', name: '清华大学' },
          major: { id: majorId, name: '计算机科学与技术' },
          status: 'published',
          confidence: 0.95,
        },
      ];

      mockPrismaService.campInfo.findMany.mockResolvedValue(mockCamps);
      mockPrismaService.campInfo.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        majorId,
      });

      expect(result.data).toEqual(mockCamps);
      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith({
        where: { status: 'published', majorId },
        skip: 0,
        take: 20,
        orderBy: { publishDate: 'desc' },
        include: {
          university: true,
          major: true,
        },
      });
    });

    it('TC-CAMP-004: 获取夏令营列表 - 组合筛选', async () => {
      const universityId = 'u1';
      const majorId = 'm1';
      const mockCamps = [
        {
          id: '1',
          title: '2026年计算机学院夏令营',
          sourceUrl: 'http://example.com/camp1',
          university: { id: universityId, name: '清华大学' },
          major: { id: majorId, name: '计算机科学与技术' },
          status: 'published',
          confidence: 0.95,
        },
      ];

      mockPrismaService.campInfo.findMany.mockResolvedValue(mockCamps);
      mockPrismaService.campInfo.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        universityId,
        majorId,
      });

      expect(result.data).toEqual(mockCamps);
      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith({
        where: { status: 'published', universityId, majorId },
        skip: 0,
        take: 20,
        orderBy: { publishDate: 'desc' },
        include: {
          university: true,
          major: true,
        },
      });
    });

    it('TC-CAMP-005: 获取夏令营列表 - 分页边界', async () => {
      mockPrismaService.campInfo.findMany.mockResolvedValue([]);
      mockPrismaService.campInfo.count.mockResolvedValue(5);

      const result = await service.findAll({ page: 999, limit: 20 });

      expect(result.meta.page).toBe(999);
      expect(result.data).toEqual([]);
      expect(result.meta.totalPages).toBe(1);
    });

    it('TC-CAMP-006: 获取夏令营列表 - 数据关联验证', async () => {
      const mockCamps = [
        {
          id: '1',
          title: '2026年计算机学院夏令营',
          sourceUrl: 'http://example.com/camp1',
          university: { id: 'u1', name: '清华大学' },
          major: { id: 'm1', name: '计算机科学与技术' },
          status: 'published',
          confidence: 0.95,
        },
      ];

      mockPrismaService.campInfo.findMany.mockResolvedValue(mockCamps);
      mockPrismaService.campInfo.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data[0]).toHaveProperty('university');
      expect(result.data[0].university).toHaveProperty('id');
      expect(result.data[0].university).toHaveProperty('name');
      expect(result.data[0]).toHaveProperty('major');
      expect(result.data[0].major).toHaveProperty('id');
      expect(result.data[0].major).toHaveProperty('name');
    });

    it('应该只返回published状态的夏令营', async () => {
      mockPrismaService.campInfo.findMany.mockResolvedValue([]);
      mockPrismaService.campInfo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'published' },
        })
      );
    });

    it('应该按publishDate降序排列', async () => {
      mockPrismaService.campInfo.findMany.mockResolvedValue([]);
      mockPrismaService.campInfo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { publishDate: 'desc' },
        })
      );
    });

    it('应该正确关联university和major', async () => {
      mockPrismaService.campInfo.findMany.mockResolvedValue([]);
      mockPrismaService.campInfo.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            university: true,
            major: true,
          },
        })
      );
    });

    it('空数据库应该返回空数组', async () => {
      mockPrismaService.campInfo.findMany.mockResolvedValue([]);
      mockPrismaService.campInfo.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('应该正确处理分页计算', async () => {
      const mockCamps = Array(5).fill(null).map((_, i) => ({
        id: `${i + 1}`,
        title: `夏令营${i + 1}`,
        sourceUrl: `http://example.com/camp${i + 1}`,
        university: { id: 'u1', name: '清华大学' },
        major: { id: 'm1', name: '计算机' },
        status: 'published',
        confidence: 0.9,
      }));

      mockPrismaService.campInfo.findMany.mockResolvedValue(mockCamps);
      mockPrismaService.campInfo.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3);
      expect(mockPrismaService.campInfo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });
  });

  describe('获取夏令营详情', () => {
    it('应该返回夏令营详情', async () => {
      const campId = 'camp_123';
      const mockCamp = {
        id: campId,
        title: '2026年计算机学院夏令营',
        sourceUrl: 'http://example.com/camp',
        status: 'published',
        confidence: 0.95,
        university: {
          id: 'u1',
          name: '清华大学',
          logo: 'http://example.com/logo.png',
          level: '985',
          website: 'http://www.tsinghua.edu.cn',
        },
        major: {
          id: 'm1',
          name: '计算机科学与技术',
          category: '工学',
        },
      };

      mockPrismaService.campInfo.findUnique.mockResolvedValue(mockCamp);

      const result = await service.findOne(campId);

      expect(result).toEqual(mockCamp);
      expect(mockPrismaService.campInfo.findUnique).toHaveBeenCalledWith({
        where: { id: campId },
        include: {
          university: {
            select: {
              id: true,
              name: true,
              logo: true,
              level: true,
              website: true,
            },
          },
          major: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
      });
    });

    it('夏令营不存在时应该抛出NotFoundException', async () => {
      const campId = 'non_existent_id';

      mockPrismaService.campInfo.findUnique.mockResolvedValue(null);

      await expect(service.findOne(campId)).rejects.toThrow('夏令营不存在');
    });
  });
});
