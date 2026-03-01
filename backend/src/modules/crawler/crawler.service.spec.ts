import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('CrawlerService', () => {
  let service: CrawlerService;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrawlerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CrawlerService>(CrawlerService);
    jest.clearAllMocks();
    (service as any).activeTasks.clear();
  });

  it('回归: trigger 返回的 taskId 应与 logId 一致', async () => {
    mockPrismaService.crawlerLog.create.mockResolvedValue({
      id: 'log_1',
      universityId: 'all',
      status: 'running',
      startTime: new Date(),
    });
    jest.spyOn(service as any, 'executeCrawler').mockResolvedValue(undefined);

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
    jest.spyOn(service as any, 'executeCrawler').mockResolvedValue(undefined);

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
    await expect(service.getTaskStatus('not_found')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

