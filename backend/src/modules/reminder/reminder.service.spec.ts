/**
 * 提醒服务单元测试
 * 测试用例覆盖: TC-REM-001 ~ TC-REM-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ReminderService } from './reminder.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReminderService', () => {
  let service: ReminderService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    reminder: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('创建提醒', () => {
    it('TC-REM-001: 创建提醒 - 成功场景', async () => {
      const createDto = {
        userId: 'user_123',
        campId: 'camp_456',
        remindTime: new Date('2026-06-25'),
      };

      const mockReminder = {
        id: 'reminder_789',
        ...createDto,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.reminder.create.mockResolvedValue(mockReminder);

      const result = await service.create(createDto);

      expect(result).toEqual(mockReminder);
      expect(mockPrismaService.reminder.create).toHaveBeenCalledWith({
        data: createDto,
      });
    });

    it('TC-REM-002: 创建提醒 - 无效用户ID', async () => {
      const createDto = {
        userId: 'invalid_user_id',
        campId: 'camp_456',
        remindTime: new Date('2026-06-25'),
      };

      const prismaError = new Error('Foreign key constraint failed');
      (prismaError as any).code = 'P2003';
      mockPrismaService.reminder.create.mockRejectedValue(prismaError);

      await expect(service.create(createDto)).rejects.toThrow();
    });

    it('TC-REM-003: 创建提醒 - 无效夏令营ID', async () => {
      const createDto = {
        userId: 'user_123',
        campId: 'invalid_camp_id',
        remindTime: new Date('2026-06-25'),
      };

      const prismaError = new Error('Foreign key constraint failed');
      (prismaError as any).code = 'P2003';
      mockPrismaService.reminder.create.mockRejectedValue(prismaError);

      await expect(service.create(createDto)).rejects.toThrow();
    });

    it('应该正确处理包含所有字段的DTO', async () => {
      const createDto = {
        userId: 'user_123',
        campId: 'camp_456',
        remindTime: new Date('2026-06-25'),
        templateId: 'template_001',
      };

      const mockReminder = {
        id: 'reminder_789',
        ...createDto,
        status: 'pending',
        sentAt: null,
        errorMsg: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.reminder.create.mockResolvedValue(mockReminder);

      const result = await service.create(createDto);

      expect(result).toEqual(mockReminder);
      expect(mockPrismaService.reminder.create).toHaveBeenCalledWith({
        data: createDto,
      });
    });
  });

  describe('获取提醒列表', () => {
    it('TC-REM-004: 获取提醒列表 - 基础查询', async () => {
      const mockReminders = [
        {
          id: 'reminder_1',
          userId: 'user_123',
          campId: 'camp_456',
          remindTime: new Date('2026-06-25'),
          status: 'pending',
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'reminder_2',
          userId: 'user_123',
          campId: 'camp_789',
          remindTime: new Date('2026-07-01'),
          status: 'sent',
          sentAt: new Date(),
          createdAt: new Date('2026-01-02'),
        },
      ];

      mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);

      const result = await service.findAll();

      expect(result).toEqual(mockReminders);
      expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该按createdAt降序排列', async () => {
      mockPrismaService.reminder.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('空数据库应该返回空数组', async () => {
      mockPrismaService.reminder.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('应该返回包含所有状态的提醒', async () => {
      const mockReminders = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'sent' },
        { id: '3', status: 'failed' },
        { id: '4', status: 'expired' },
      ];

      mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);

      const result = await service.findAll();

      expect(result).toHaveLength(4);
    });
  });

  describe('删除提醒', () => {
    it('TC-REM-005: 删除提醒 - 成功场景', async () => {
      const reminderId = 'reminder_123';
      const mockDeletedReminder = {
        id: reminderId,
        userId: 'user_123',
        campId: 'camp_456',
        status: 'pending',
      };

      mockPrismaService.reminder.delete.mockResolvedValue(mockDeletedReminder);

      const result = await service.remove(reminderId);

      expect(result).toEqual(mockDeletedReminder);
      expect(mockPrismaService.reminder.delete).toHaveBeenCalledWith({
        where: { id: reminderId },
      });
    });

    it('TC-REM-006: 删除提醒 - 无效ID', async () => {
      const invalidId = 'invalid_reminder_id';

      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrismaService.reminder.delete.mockRejectedValue(prismaError);

      await expect(service.remove(invalidId)).rejects.toThrow();
    });

    it('应该正确处理空ID', async () => {
      const emptyId = '';

      mockPrismaService.reminder.delete.mockRejectedValue(new Error('Invalid ID'));

      await expect(service.remove(emptyId)).rejects.toThrow();
    });
  });

  describe('边界条件测试', () => {
    it('应该处理大量提醒数据', async () => {
      const mockReminders = Array(1000).fill(null).map((_, i) => ({
        id: `reminder_${i}`,
        userId: `user_${i % 10}`,
        campId: `camp_${i % 5}`,
        remindTime: new Date(),
        status: 'pending',
        createdAt: new Date(),
      }));

      mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);

      const result = await service.findAll();

      expect(result).toHaveLength(1000);
    });

    it('应该正确处理数据库错误', async () => {
      mockPrismaService.reminder.findMany.mockRejectedValue(new Error('Database connection error'));

      await expect(service.findAll()).rejects.toThrow('Database connection error');
    });

    it('创建提醒时应该允许未来的日期', async () => {
      const futureDate = new Date('2027-01-01');
      const createDto = {
        userId: 'user_123',
        campId: 'camp_456',
        remindTime: futureDate,
      };

      const mockReminder = {
        id: 'reminder_789',
        ...createDto,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.reminder.create.mockResolvedValue(mockReminder);

      const result = await service.create(createDto);

      expect(result.remindTime).toEqual(futureDate);
    });
  });
});
