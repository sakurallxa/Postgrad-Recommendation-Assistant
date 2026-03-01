"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const reminder_service_1 = require("./reminder.service");
const prisma_service_1 = require("../prisma/prisma.service");
const common_1 = require("@nestjs/common");
describe('ReminderService', () => {
    let service;
    let prismaService;
    const mockPrismaService = {
        reminder: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
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
        const userId = 'user_123';
        it('TC-REM-001: 创建提醒 - 成功场景', async () => {
            const createDto = {
                campId: 'camp_456',
                remindTime: '2026-06-25T09:00:00Z',
                content: '测试提醒',
            };
            const mockReminder = {
                id: 'reminder_789',
                userId,
                campId: createDto.campId,
                remindTime: new Date(createDto.remindTime),
                content: createDto.content,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrismaService.reminder.create.mockResolvedValue(mockReminder);
            const result = await service.create(userId, createDto);
            expect(result).toEqual(mockReminder);
            expect(mockPrismaService.reminder.create).toHaveBeenCalledWith({
                data: {
                    campId: createDto.campId,
                    content: createDto.content,
                    remindTime: new Date(createDto.remindTime),
                    userId,
                },
            });
        });
        it('TC-REM-002: 创建提醒 - 无效用户ID', async () => {
            const createDto = {
                campId: 'camp_456',
                remindTime: '2026-06-25T09:00:00Z',
            };
            const prismaError = new Error('Foreign key constraint failed');
            prismaError.code = 'P2003';
            mockPrismaService.reminder.create.mockRejectedValue(prismaError);
            await expect(service.create('invalid_user_id', createDto)).rejects.toThrow();
        });
        it('TC-REM-003: 创建提醒 - 无效夏令营ID', async () => {
            const createDto = {
                campId: 'invalid_camp_id',
                remindTime: '2026-06-25T09:00:00Z',
            };
            const prismaError = new Error('Foreign key constraint failed');
            prismaError.code = 'P2003';
            mockPrismaService.reminder.create.mockRejectedValue(prismaError);
            await expect(service.create(userId, createDto)).rejects.toThrow();
        });
        it('应该正确处理包含所有字段的DTO', async () => {
            const createDto = {
                campId: 'camp_456',
                remindTime: '2026-06-25T09:00:00Z',
                content: '测试提醒内容',
            };
            const mockReminder = {
                id: 'reminder_789',
                userId,
                campId: createDto.campId,
                remindTime: new Date(createDto.remindTime),
                content: createDto.content,
                status: 'pending',
                sentAt: null,
                errorMsg: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrismaService.reminder.create.mockResolvedValue(mockReminder);
            const result = await service.create(userId, createDto);
            expect(result).toEqual(mockReminder);
            expect(mockPrismaService.reminder.create).toHaveBeenCalledWith({
                data: {
                    campId: createDto.campId,
                    content: createDto.content,
                    remindTime: new Date(createDto.remindTime),
                    userId,
                },
            });
        });
        it('安全测试: 用户A不能创建用户B的提醒', async () => {
            const userA = 'user_a';
            const createDto = {
                campId: 'camp_456',
                remindTime: '2026-06-25T09:00:00Z',
            };
            const mockReminder = {
                id: 'reminder_789',
                userId: userA,
                campId: createDto.campId,
                remindTime: new Date(createDto.remindTime),
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrismaService.reminder.create.mockResolvedValue(mockReminder);
            const result = await service.create(userA, createDto);
            expect(result.userId).toBe(userA);
            expect(mockPrismaService.reminder.create).toHaveBeenCalledWith({
                data: {
                    campId: createDto.campId,
                    remindTime: new Date(createDto.remindTime),
                    userId: userA,
                },
            });
        });
    });
    describe('获取提醒列表', () => {
        const userId = 'user_123';
        it('TC-REM-004: 获取提醒列表 - 基础查询', async () => {
            const mockReminders = [
                {
                    id: 'reminder_1',
                    userId: userId,
                    campId: 'camp_456',
                    remindTime: new Date('2026-06-25T09:00:00Z'),
                    status: 'pending',
                    createdAt: new Date('2026-01-01'),
                    camp: {
                        id: 'camp_456',
                        title: 'Test Camp',
                        deadline: new Date('2026-06-30'),
                        university: {
                            id: 'uni_1',
                            name: 'Test University',
                        },
                    },
                },
                {
                    id: 'reminder_2',
                    userId: userId,
                    campId: 'camp_789',
                    remindTime: new Date('2026-07-01T09:00:00Z'),
                    status: 'sent',
                    sentAt: new Date(),
                    createdAt: new Date('2026-01-02'),
                    camp: {
                        id: 'camp_789',
                        title: 'Test Camp 2',
                        deadline: new Date('2026-07-15'),
                        university: {
                            id: 'uni_2',
                            name: 'Test University 2',
                        },
                    },
                },
            ];
            mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);
            mockPrismaService.reminder.count.mockResolvedValue(2);
            const result = await service.findAll(userId);
            expect(result.data).toEqual(mockReminders);
            expect(result.meta).toBeDefined();
            expect(result.meta.page).toBe(1);
            expect(result.meta.total).toBe(2);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { userId },
            }));
        });
        it('应该按createdAt降序排列', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(0);
            await service.findAll(userId);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                orderBy: { createdAt: 'desc' },
            }));
        });
        it('应该包含关联的camp和university数据', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(0);
            await service.findAll(userId);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                include: {
                    camp: {
                        select: {
                            id: true,
                            title: true,
                            deadline: true,
                            university: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            }));
        });
        it('空数据库应该返回空数组', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(0);
            const result = await service.findAll(userId);
            expect(result.data).toEqual([]);
            expect(result.meta.total).toBe(0);
        });
        it('应该按状态筛选提醒', async () => {
            const mockReminders = [
                { id: '1', status: 'pending', userId },
                { id: '2', status: 'pending', userId },
            ];
            mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);
            mockPrismaService.reminder.count.mockResolvedValue(2);
            const result = await service.findAll(userId, 1, 20, 'pending');
            expect(result.data).toHaveLength(2);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { userId, status: 'pending' },
            }));
        });
        it('应该支持分页参数', async () => {
            mockPrismaService.reminder.findMany.mockResolvedValue([]);
            mockPrismaService.reminder.count.mockResolvedValue(100);
            const result = await service.findAll(userId, 2, 10);
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
            await service.findAll(userId, 1, 200);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                take: 100,
            }));
        });
    });
    describe('删除提醒', () => {
        const userId = 'user_123';
        it('TC-REM-005: 删除提醒 - 成功场景', async () => {
            const reminderId = 'reminder_123';
            const mockReminder = {
                id: reminderId,
                userId: userId,
                campId: 'camp_456',
                status: 'pending',
            };
            mockPrismaService.reminder.findUnique.mockResolvedValue(mockReminder);
            mockPrismaService.reminder.delete.mockResolvedValue(mockReminder);
            const result = await service.remove(userId, reminderId);
            expect(result).toEqual(mockReminder);
            expect(mockPrismaService.reminder.findUnique).toHaveBeenCalledWith({
                where: { id: reminderId },
            });
            expect(mockPrismaService.reminder.delete).toHaveBeenCalledWith({
                where: { id: reminderId },
            });
        });
        it('TC-REM-006: 删除提醒 - 无效ID', async () => {
            const invalidId = 'invalid_reminder_id';
            mockPrismaService.reminder.findUnique.mockResolvedValue(null);
            await expect(service.remove(userId, invalidId)).rejects.toThrow(common_1.NotFoundException);
        });
        it('安全测试: 用户A不能删除用户B的提醒', async () => {
            const userA = 'user_a';
            const userB = 'user_b';
            const reminderId = 'reminder_123';
            const mockReminder = {
                id: reminderId,
                userId: userB,
                campId: 'camp_456',
                status: 'pending',
            };
            mockPrismaService.reminder.findUnique.mockResolvedValue(mockReminder);
            await expect(service.remove(userA, reminderId)).rejects.toThrow(common_1.ForbiddenException);
            expect(mockPrismaService.reminder.delete).not.toHaveBeenCalled();
        });
        it('应该正确处理空ID', async () => {
            const emptyId = '';
            mockPrismaService.reminder.findUnique.mockResolvedValue(null);
            await expect(service.remove(userId, emptyId)).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('边界条件测试', () => {
        const userId = 'user_123';
        it('应该处理大量提醒数据', async () => {
            const mockReminders = Array(1000).fill(null).map((_, i) => ({
                id: `reminder_${i}`,
                userId: userId,
                campId: `camp_${i % 5}`,
                remindTime: new Date('2026-06-25T09:00:00Z'),
                status: 'pending',
                createdAt: new Date(),
                camp: {
                    id: `camp_${i % 5}`,
                    title: `Camp ${i % 5}`,
                    deadline: new Date(),
                    university: {
                        id: `uni_${i % 3}`,
                        name: `University ${i % 3}`,
                    },
                },
            }));
            mockPrismaService.reminder.findMany.mockResolvedValue(mockReminders);
            mockPrismaService.reminder.count.mockResolvedValue(1000);
            const result = await service.findAll(userId);
            expect(result.data).toHaveLength(1000);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { userId },
            }));
        });
        it('应该正确处理数据库错误', async () => {
            mockPrismaService.reminder.findMany.mockRejectedValue(new Error('Database connection error'));
            await expect(service.findAll(userId)).rejects.toThrow('Database connection error');
        });
        it('创建提醒时应该允许未来的日期', async () => {
            const futureDate = '2027-01-01T09:00:00Z';
            const createDto = {
                campId: 'camp_456',
                remindTime: futureDate,
            };
            const mockReminder = {
                id: 'reminder_789',
                userId,
                campId: createDto.campId,
                remindTime: new Date(futureDate),
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrismaService.reminder.create.mockResolvedValue(mockReminder);
            const result = await service.create(userId, createDto);
            expect(result.remindTime).toEqual(new Date(futureDate));
        });
        it('应该只返回当前用户的提醒，不返回其他用户的', async () => {
            const otherUserId = 'user_456';
            const currentUserReminders = [
                { id: '1', userId, campId: 'camp_1', status: 'pending' },
                { id: '2', userId, campId: 'camp_2', status: 'sent' },
            ];
            mockPrismaService.reminder.findMany.mockResolvedValue(currentUserReminders);
            mockPrismaService.reminder.count.mockResolvedValue(2);
            const result = await service.findAll(userId);
            expect(mockPrismaService.reminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { userId },
            }));
            expect(result.data.every((r) => r.userId === userId)).toBe(true);
        });
    });
});
//# sourceMappingURL=reminder.service.spec.js.map