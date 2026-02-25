"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const university_service_1 = require("./university.service");
const prisma_service_1 = require("../prisma/prisma.service");
describe('UniversityService', () => {
    let service;
    let prismaService;
    const mockPrismaService = {
        university: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                university_service_1.UniversityService,
                { provide: prisma_service_1.PrismaService, useValue: mockPrismaService },
            ],
        }).compile();
        service = module.get(university_service_1.UniversityService);
        prismaService = module.get(prisma_service_1.PrismaService);
        jest.clearAllMocks();
    });
    describe('获取院校列表', () => {
        it('TC-UNIV-001: 获取院校列表 - 基础查询', async () => {
            const mockUniversities = [
                { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0' },
                { id: '2', name: '北京大学', region: '北京', level: '985', priority: 'P0' },
            ];
            mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
            mockPrismaService.university.count.mockResolvedValue(2);
            const result = await service.findAll({ page: 1, limit: 20 });
            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('meta');
            expect(result.data).toEqual(mockUniversities);
            expect(result.meta).toEqual({
                page: 1,
                limit: 20,
                total: 2,
                totalPages: 1,
            });
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith({
                where: {},
                skip: 0,
                take: 20,
                orderBy: { priority: 'asc' },
            });
        });
        it('TC-UNIV-002: 获取院校列表 - 分页查询', async () => {
            const mockUniversities = Array(10).fill(null).map((_, i) => ({
                id: `${i + 11}`,
                name: `大学${i + 11}`,
                region: '北京',
                level: '985',
                priority: 'P1',
            }));
            mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
            mockPrismaService.university.count.mockResolvedValue(100);
            const result = await service.findAll({ page: 2, limit: 10 });
            expect(result.meta.page).toBe(2);
            expect(result.meta.limit).toBe(10);
            expect(result.meta.total).toBe(100);
            expect(result.meta.totalPages).toBe(10);
            expect(result.data).toHaveLength(10);
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith({
                where: {},
                skip: 10,
                take: 10,
                orderBy: { priority: 'asc' },
            });
        });
        it('TC-UNIV-003: 获取院校列表 - 按地区筛选', async () => {
            const mockUniversities = [
                { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0' },
                { id: '2', name: '北京大学', region: '北京', level: '985', priority: 'P0' },
            ];
            mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
            mockPrismaService.university.count.mockResolvedValue(2);
            const result = await service.findAll({ page: 1, limit: 20, region: '北京' });
            expect(result.data).toEqual(mockUniversities);
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith({
                where: { region: '北京' },
                skip: 0,
                take: 20,
                orderBy: { priority: 'asc' },
            });
        });
        it('TC-UNIV-004: 获取院校列表 - 按等级筛选', async () => {
            const mockUniversities = [
                { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0' },
                { id: '2', name: '北京大学', region: '北京', level: '985', priority: 'P0' },
            ];
            mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
            mockPrismaService.university.count.mockResolvedValue(2);
            const result = await service.findAll({ page: 1, limit: 20, level: '985' });
            expect(result.data).toEqual(mockUniversities);
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith({
                where: { level: '985' },
                skip: 0,
                take: 20,
                orderBy: { priority: 'asc' },
            });
        });
        it('TC-UNIV-005: 获取院校列表 - 组合筛选', async () => {
            const mockUniversities = [
                { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0' },
            ];
            mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
            mockPrismaService.university.count.mockResolvedValue(1);
            const result = await service.findAll({
                page: 1,
                limit: 20,
                region: '北京',
                level: '985',
            });
            expect(result.data).toEqual(mockUniversities);
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith({
                where: { region: '北京', level: '985' },
                skip: 0,
                take: 20,
                orderBy: { priority: 'asc' },
            });
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
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
        });
        it('分页边界测试 - 大页码', async () => {
            mockPrismaService.university.findMany.mockResolvedValue([]);
            mockPrismaService.university.count.mockResolvedValue(100);
            const result = await service.findAll({ page: 999, limit: 20 });
            expect(result.meta.page).toBe(999);
            expect(result.data).toEqual([]);
        });
        it('应该按priority升序排列', async () => {
            mockPrismaService.university.findMany.mockResolvedValue([]);
            mockPrismaService.university.count.mockResolvedValue(0);
            await service.findAll({ page: 1, limit: 20 });
            expect(mockPrismaService.university.findMany).toHaveBeenCalledWith(expect.objectContaining({
                orderBy: { priority: 'asc' },
            }));
        });
        it('应该正确处理Promise.all', async () => {
            const mockUniversities = [
                { id: '1', name: '清华大学', region: '北京', level: '985', priority: 'P0' },
            ];
            mockPrismaService.university.findMany.mockResolvedValue(mockUniversities);
            mockPrismaService.university.count.mockResolvedValue(1);
            const result = await service.findAll({ page: 1, limit: 20 });
            expect(mockPrismaService.university.findMany).toHaveBeenCalled();
            expect(mockPrismaService.university.count).toHaveBeenCalled();
            expect(result.data).toEqual(mockUniversities);
        });
    });
});
//# sourceMappingURL=university.service.spec.js.map