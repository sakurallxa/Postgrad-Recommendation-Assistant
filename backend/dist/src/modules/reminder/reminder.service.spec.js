"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const reminder_service_1 = require("./reminder.service");
const prisma_service_1 = require("../prisma/prisma.service");
describe('ReminderService', () => {
    let service;
    let prismaService;
    const mockPrismaService = {
        reminder: {
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
        },
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                reminder_service_1.ReminderService,
                { provide: prisma_service_1.PrismaService, useValue: mockPrismaService },
            ],
        }).compile();
        service = module.get(reminder_service_1.ReminderService);
        prismaService = module.get(prisma_service_1.PrismaService);
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
            prismaError.code = 'P2003';
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
            prismaError.code = 'P2003';
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
            mockPrismaService.reminder.count.mockResolvedValue(2);
            const result = await service.findAll();
            expect(result.data).toEqual(mockReminders);
            expect(result.meta).toBeDefined();
            expect(result.meta.page).toBe(1);
            expect(result.meta.total).toBe(2);
        });
        it('应该按createdAt降序排列', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(0);
            await service.findAll();
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                orderBy: { createdAt: 'desc' },
            }));
        });
        it('空数据库应该返回空数组', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(0);
            const result = await service.findAll();
            expect(result.data).toEqual([]);
            expect(result.meta.total).toBe(0);
        });
        it('应该返回包含所有状态的提醒', async () => {
            const mockReminders = [
                { id: '1', status: 'pending' },
                { id: '2', status: 'sent' },
                { id: '3', status: 'failed' },
                { id: '4', status: 'expired' },
            ];
            mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);
            mockPrismaService.reminder.count.mockResolvedValue(4);
            const result = await service.findAll();
            expect(result.data).toHaveLength(4);
        });
        it('应该支持分页参数', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(100);
            const result = await service.findAll(2, 10);
            expect(result.meta.page).toBe(2);
            expect(result.meta.limit).toBe(10);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                skip: 10,
                take: 10,
            }));
        });
        it('应该限制最大返回数量', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(1000);
            await service.findAll(1, 200);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                take: 100,
            }));
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
            prismaError.code = 'P2025';
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
            mockPrismaService.reminder.count.mockResolvedValue(1000);
            const result = await service.findAll();
            expect(result.data).toHaveLength(1000);
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
//# sourceMappingURL=reminder.service.spec.js.map