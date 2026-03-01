"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const crawler_service_1 = require("./crawler.service");
const prisma_service_1 = require("../prisma/prisma.service");
const config_1 = require("@nestjs/config");
describe('CrawlerService', () => {
    let service;
    const mockPrismaService = {
        crawlerLog: {
            create: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
        },
    };
    const mockConfigService = {
        get: jest.fn(),
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                crawler_service_1.CrawlerService,
                { provide: prisma_service_1.PrismaService, useValue: mockPrismaService },
                { provide: config_1.ConfigService, useValue: mockConfigService },
            ],
        }).compile();
        service = module.get(crawler_service_1.CrawlerService);
        jest.clearAllMocks();
        service.activeTasks.clear();
    });
    it('回归: trigger 返回的 taskId 应与 logId 一致', async () => {
        mockPrismaService.crawlerLog.create.mockResolvedValue({
            id: 'log_1',
            universityId: 'all',
            status: 'running',
            startTime: new Date(),
        });
        jest.spyOn(service, 'executeCrawler').mockResolvedValue(undefined);
        const result = await service.trigger();
        expect(result.taskId).toBe('log_1');
        expect(result.logId).toBe('log_1');
    });
    it('回归: 活跃任务状态查询使用统一 taskId', async () => {
        mockPrismaService.crawlerLog.create.mockResolvedValue({
            id: 'log_2',
            universityId: 'all',
            status: 'running',
            startTime: new Date(),
        });
        jest.spyOn(service, 'executeCrawler').mockResolvedValue(undefined);
        await service.trigger();
        const status = await service.getTaskStatus('log_2');
        expect(status.taskId).toBe('log_2');
        expect(status.logId).toBe('log_2');
    });
    it('回归: 历史任务可通过 taskId 查询', async () => {
        mockPrismaService.crawlerLog.findFirst.mockResolvedValue({
            id: 'log_history_1',
            universityId: 'all',
            status: 'success',
            itemsCount: 12,
            errorMsg: null,
            createdAt: new Date(),
            startTime: new Date(),
            endTime: new Date(),
        });
        const status = await service.getTaskStatus('log_history_1');
        expect(status.taskId).toBe('log_history_1');
        expect(status.logId).toBe('log_history_1');
        expect(mockPrismaService.crawlerLog.findFirst).toHaveBeenCalledWith({
            where: { id: 'log_history_1' },
        });
    });
    it('任务不存在时应抛出异常', async () => {
        mockPrismaService.crawlerLog.findFirst.mockResolvedValue(null);
        await expect(service.getTaskStatus('not_found')).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
});
//# sourceMappingURL=crawler.service.spec.js.map