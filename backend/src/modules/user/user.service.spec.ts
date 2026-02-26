/**
 * 用户服务单元测试
 * 测试用例覆盖: 用户信息获取、用户选择管理
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    userSelection: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    university: {
      findMany: jest.fn(),
    },
    major: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('获取用户信息', () => {
    it('TC-USER-001: 获取用户信息 - 成功场景', async () => {
      const userId = 'user_123';
      // mock数据模拟Prisma返回（不包含openid，因为select中已排除）
      const mockUser = {
        id: userId,
        // openid已从select中排除
        createdAt: new Date('2026-01-01'),
        selection: {
          universityIds: '["uni_1", "uni_2"]',
          majorIds: '["major_1"]',
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId);

      expect(result).toEqual({
        id: userId,
        createdAt: mockUser.createdAt,
        selection: {
          universityIds: '["uni_1", "uni_2"]',
          majorIds: '["major_1"]',
        },
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: {
          id: true,
          // openid: true, // 隐私字段不返回
          createdAt: true,
          selection: {
            select: {
              universityIds: true,
              majorIds: true,
            },
          },
        },
      });
    });

    it('TC-USER-002: 获取用户信息 - 用户不存在', async () => {
      const userId = 'non_existent_user';
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(userId)).rejects.toThrow(NotFoundException);
      await expect(service.getProfile(userId)).rejects.toThrow('用户不存在');
    });

    it('TC-USER-003: 获取用户信息 - 用户无选择数据', async () => {
      const userId = 'user_no_selection';
      // mock数据模拟Prisma返回（不包含openid，因为select中已排除）
      const mockUser = {
        id: userId,
        // openid已从select中排除
        createdAt: new Date('2026-01-01'),
        selection: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId);

      expect(result.selection).toEqual({
        universityIds: '[]',
        majorIds: '[]',
      });
    });

    it('TC-USER-004: 获取用户信息 - 无效用户ID格式', async () => {
      const userId = '';
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('获取用户选择', () => {
    it('TC-USER-005: 获取用户选择 - 成功场景', async () => {
      const userId = 'user_123';
      const mockSelection = {
        userId,
        universityIds: '["uni_1", "uni_2"]',
        majorIds: '["major_1", "major_2"]',
      };

      const mockUniversities = [
        { id: 'uni_1', name: '清华大学', logo: 'logo1.png', level: '985' },
        { id: 'uni_2', name: '北京大学', logo: 'logo2.png', level: '985' },
      ];

      const mockMajors = [
        { id: 'major_1', name: '计算机科学与技术', category: '工学', university: { id: 'uni_1', name: '清华大学' } },
        { id: 'major_2', name: '软件工程', category: '工学', university: { id: 'uni_1', name: '清华大学' } },
      ];

      mockPrismaService.userSelection.findUnique.mockResolvedValue(mockSelection);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.major.findMany.mockResolvedValue(mockMajors);

      const result = await service.getSelection(userId);

      expect(result).toEqual({
        universities: mockUniversities,
        majors: mockMajors,
        totalUniversities: 2,
        totalMajors: 2,
      });
    });

    it('TC-USER-006: 获取用户选择 - 无选择数据', async () => {
      const userId = 'user_no_selection';
      mockPrismaService.userSelection.findUnique.mockResolvedValue(null);

      const result = await service.getSelection(userId);

      expect(result).toEqual({
        universityIds: [],
        majorIds: [],
      });
    });

    it('TC-USER-007: 获取用户选择 - 空JSON数组', async () => {
      const userId = 'user_empty_selection';
      const mockSelection = {
        userId,
        universityIds: '[]',
        majorIds: '[]',
      };

      mockPrismaService.userSelection.findUnique.mockResolvedValue(mockSelection);
      mockPrismaService.university.findMany.mockResolvedValue([]);
      mockPrismaService.major.findMany.mockResolvedValue([]);

      const result = await service.getSelection(userId);

      expect(result.totalUniversities).toBe(0);
      expect(result.totalMajors).toBe(0);
    });

    it('TC-USER-008: 获取用户选择 - 部分院校不存在', async () => {
      const userId = 'user_partial';
      const mockSelection = {
        userId,
        universityIds: '["uni_1", "uni_deleted", "uni_2"]',
        majorIds: '["major_1"]',
      };

      const mockUniversities = [
        { id: 'uni_1', name: '清华大学', logo: 'logo1.png', level: '985' },
        { id: 'uni_2', name: '北京大学', logo: 'logo2.png', level: '985' },
      ];

      mockPrismaService.userSelection.findUnique.mockResolvedValue(mockSelection);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.major.findMany.mockResolvedValue([]);

      const result = await service.getSelection(userId);

      expect(result.totalUniversities).toBe(2);
    });
  });

  describe('更新用户选择', () => {
    it('TC-USER-009: 更新用户选择 - 成功场景', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: ['uni_1', 'uni_2'],
        majorIds: ['major_1'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockUniversities = [{ id: 'uni_1' }, { id: 'uni_2' }];
      const mockMajors = [{ id: 'major_1' }];
      const mockSelection = {
        userId,
        universityIds: JSON.stringify(dto.universityIds),
        majorIds: JSON.stringify(dto.majorIds),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.major.findMany.mockResolvedValue(mockMajors);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      const result = await service.updateSelection(userId, dto);

      expect(result.message).toBe('用户选择更新成功');
      expect(result.selection.universityIds).toEqual(dto.universityIds);
      expect(result.selection.majorIds).toEqual(dto.majorIds);
    });

    it('TC-USER-010: 更新用户选择 - 用户不存在', async () => {
      const userId = 'non_existent_user';
      const dto = { universityIds: ['uni_1'] };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateSelection(userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('TC-USER-011: 更新用户选择 - 无效院校ID', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: ['uni_1', 'invalid_uni'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockUniversities = [{ id: 'uni_1' }];

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);

      await expect(service.updateSelection(userId, dto)).rejects.toThrow(NotFoundException);
      await expect(service.updateSelection(userId, dto)).rejects.toThrow('无效的院校ID: invalid_uni');
    });

    it('TC-USER-012: 更新用户选择 - 无效专业ID', async () => {
      const userId = 'user_123';
      const dto = {
        majorIds: ['major_1', 'invalid_major'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockMajors = [{ id: 'major_1' }];

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.major.findMany.mockResolvedValue(mockMajors);

      await expect(service.updateSelection(userId, dto)).rejects.toThrow(NotFoundException);
      await expect(service.updateSelection(userId, dto)).rejects.toThrow('无效的专业ID: invalid_major');
    });

    it('TC-USER-013: 更新用户选择 - 只更新院校', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: ['uni_1'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockUniversities = [{ id: 'uni_1' }];
      const mockSelection = {
        userId,
        universityIds: JSON.stringify(dto.universityIds),
        majorIds: '[]',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      const result = await service.updateSelection(userId, dto);

      expect(result.selection.universityIds).toEqual(['uni_1']);
      expect(result.selection.majorIds).toEqual([]);
    });

    it('TC-USER-014: 更新用户选择 - 只更新专业', async () => {
      const userId = 'user_123';
      const dto = {
        majorIds: ['major_1'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockMajors = [{ id: 'major_1' }];
      const mockSelection = {
        userId,
        universityIds: '[]',
        majorIds: JSON.stringify(dto.majorIds),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.major.findMany.mockResolvedValue(mockMajors);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      const result = await service.updateSelection(userId, dto);

      expect(result.selection.universityIds).toEqual([]);
      expect(result.selection.majorIds).toEqual(['major_1']);
    });

    it('TC-USER-015: 更新用户选择 - 清空选择', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: [],
        majorIds: [],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockSelection = {
        userId,
        universityIds: '[]',
        majorIds: '[]',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      const result = await service.updateSelection(userId, dto);

      expect(result.selection.universityIds).toEqual([]);
      expect(result.selection.majorIds).toEqual([]);
    });

    it('TC-USER-016: 更新用户选择 - 大量数据', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: Array(100).fill(null).map((_, i) => `uni_${i}`),
        majorIds: Array(100).fill(null).map((_, i) => `major_${i}`),
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockUniversities = dto.universityIds.map(id => ({ id }));
      const mockMajors = dto.majorIds.map(id => ({ id }));
      const mockSelection = {
        userId,
        universityIds: JSON.stringify(dto.universityIds),
        majorIds: JSON.stringify(dto.majorIds),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.major.findMany.mockResolvedValue(mockMajors);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      const result = await service.updateSelection(userId, dto);

      expect(result.selection.universityIds).toHaveLength(100);
      expect(result.selection.majorIds).toHaveLength(100);
    });

    it('TC-USER-017: 更新用户选择 - 并发更新', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: ['uni_1'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockUniversities = [{ id: 'uni_1' }];
      const mockSelection = {
        userId,
        universityIds: JSON.stringify(dto.universityIds),
        majorIds: '[]',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      // 模拟并发更新
      const promises = Array(5).fill(null).map(() => service.updateSelection(userId, dto));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.message).toBe('用户选择更新成功');
      });
    });
  });

  describe('边界条件测试', () => {
    it('应该处理null universityIds', async () => {
      const userId = 'user_123';
      const mockSelection = {
        userId,
        universityIds: null,
        majorIds: null,
      };

      mockPrismaService.userSelection.findUnique.mockResolvedValue(mockSelection);
      mockPrismaService.university.findMany.mockResolvedValue([]);
      mockPrismaService.major.findMany.mockResolvedValue([]);

      const result = await service.getSelection(userId);

      expect(result.universities).toEqual([]);
      expect(result.majors).toEqual([]);
    });

    it('应该安全处理无效的JSON字符串', async () => {
      const userId = 'user_123';
      const mockSelection = {
        userId,
        universityIds: 'invalid json',
        majorIds: '[]',
      };

      mockPrismaService.userSelection.findUnique.mockResolvedValue(mockSelection);
      mockPrismaService.university.findMany.mockResolvedValue([]);
      mockPrismaService.major.findMany.mockResolvedValue([]);

      // 使用安全解析后，无效JSON应该返回空数组而不是抛出异常
      const result = await service.getSelection(userId);

      expect(result.universities).toEqual([]);
      expect(result.majors).toEqual([]);
    });

    it('应该处理特殊字符在ID中', async () => {
      const userId = 'user_123';
      const dto = {
        universityIds: ['uni-1_test', 'uni.2'],
      };

      const mockUser = { id: userId, openid: 'openid_123' };
      const mockUniversities = [{ id: 'uni-1_test' }, { id: 'uni.2' }];
      const mockSelection = {
        userId,
        universityIds: JSON.stringify(dto.universityIds),
        majorIds: '[]',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
      mockPrismaService.userSelection.upsert.mockResolvedValue(mockSelection);

      const result = await service.updateSelection(userId, dto);

      expect(result.selection.universityIds).toEqual(dto.universityIds);
    });
  });
});
