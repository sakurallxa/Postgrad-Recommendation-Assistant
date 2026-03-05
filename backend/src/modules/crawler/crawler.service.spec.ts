import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProgressService } from '../progress/progress.service';
import { DeepSeekService } from '../../common/services/deepseek.service';

describe('CrawlerService', () => {
  let service: CrawlerService;

  const mockPrismaService = {
    crawlerLog: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    campInfo: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    campSourceAlias: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    campExtractionLog: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockProgressService = {
    createChangeEvent: jest.fn(),
    applySchoolDefaultSubscriptionsForCamp: jest.fn(),
  };

  const mockDeepSeekService = {
    extractCampInfo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrawlerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ProgressService, useValue: mockProgressService },
        { provide: DeepSeekService, useValue: mockDeepSeekService },
      ],
    }).compile();

    service = module.get<CrawlerService>(CrawlerService);
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((_key: string, defaultValue?: any) => defaultValue);
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

  it('ingestCamps: 新建camp应产出基线事件', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({
      id: 'camp_new_1',
    });
    mockProgressService.createChangeEvent.mockResolvedValue({ event: { id: 'evt_1' } });

    const result = await service.ingestCamps([
      {
        title: 'AI研究院2026年预推免通知',
        announcementType: 'pre_recommendation',
        universityId: 'uni_1',
        sourceUrl: 'https://example.com/notice/1',
        deadline: '2026-03-12T00:00:00.000Z',
        materials: ['成绩单', '简历'],
      },
    ]);

    expect(result.created).toBe(1);
    expect(result.eventsCreated).toBeGreaterThan(0);
    expect(mockProgressService.createChangeEvent).toHaveBeenCalled();
  });

  it('ingestCamps: 更新camp应按old/new产出变更事件', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue({
      id: 'camp_exist_1',
      title: 'AI研究院2026年预推免通知',
      announcementType: 'summer_camp',
      sourceUrl: 'https://example.com/notice/2',
      universityId: 'uni_2',
      publishDate: null,
      deadline: new Date('2026-03-10T00:00:00.000Z'),
      startDate: null,
      endDate: null,
      requirements: null,
      materials: '["成绩单"]',
      process: null,
    });
    mockPrismaService.campInfo.update.mockResolvedValue({ id: 'camp_exist_1' });
    mockProgressService.createChangeEvent.mockResolvedValue({ event: { id: 'evt_2' } });

    const result = await service.ingestCamps([
      {
        title: 'AI研究院2026年预推免通知',
        announcementType: 'pre_recommendation',
        universityId: 'uni_2',
        sourceUrl: 'https://example.com/notice/2',
        deadline: '2026-03-12T00:00:00.000Z',
        materials: ['成绩单', '简历'],
      },
    ]);

    expect(result.updated).toBe(1);
    expect(result.eventsCreated).toBeGreaterThanOrEqual(2);
    expect(mockProgressService.createChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        campId: 'camp_exist_1',
        sourceType: 'crawler',
        sourceUrl: 'https://example.com/notice/2',
      }),
    );
  });

  it('ingestCamps: 规则缺失触发DeepSeek兜底并通过schema校验后入库', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'DEEPSEEK_FALLBACK_ENABLED') return 'true';
      return defaultValue;
    });
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_new_2' });
    mockPrismaService.campExtractionLog.create.mockResolvedValue({ id: 'extract_log_1' });
    mockDeepSeekService.extractCampInfo.mockResolvedValue({
      title: '软件学院2026年夏令营',
      announcementType: 'summer_camp',
      requirements: { gradeRank: '前20%' },
      materials: ['成绩单', '简历'],
      process: ['报名', '初审', '入营'],
      contact: { email: 'camp@test.edu.cn' },
      confidence: 0.93,
    });

    const result = await service.ingestCamps([
      {
        title: '软件学院2026年夏令营',
        announcementType: 'summer_camp',
        universityId: 'uni_3',
        sourceUrl: 'https://example.com/notice/3',
        content: '夏令营通知正文，包含报名流程与材料信息',
        confidence: 0.4,
        materials: [],
        process: [],
        requirements: {},
      },
    ]);

    expect(result.created).toBe(1);
    expect(result.llmTriggered).toBe(1);
    expect(result.llmSuccess).toBe(1);
    expect(mockDeepSeekService.extractCampInfo).toHaveBeenCalled();
    expect(mockPrismaService.campExtractionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'success',
        }),
      }),
    );
    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          materials: expect.stringContaining('成绩单'),
          process: expect.stringContaining('初审'),
        }),
      }),
    );
  });

  it('ingestCamps: DeepSeek返回不符合schema时应回退规则结果并继续入库', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'DEEPSEEK_FALLBACK_ENABLED') return 'true';
      return defaultValue;
    });
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_new_3' });
    mockPrismaService.campExtractionLog.create.mockResolvedValue({ id: 'extract_log_2' });
    mockDeepSeekService.extractCampInfo.mockResolvedValue({
      // 故意缺失 title，触发 schema 校验失败
      title: '',
      announcementType: 'summer_camp',
      requirements: {},
      materials: [],
      process: [],
      contact: {},
      confidence: 0.9,
    } as any);

    const result = await service.ingestCamps([
      {
        title: '电子信息学院2026年夏令营',
        announcementType: 'summer_camp',
        universityId: 'uni_4',
        sourceUrl: 'https://example.com/notice/4',
        content: '仅有概要信息',
        confidence: 0.5,
        materials: [],
        process: [],
      },
    ]);

    expect(result.created).toBe(1);
    expect(result.llmTriggered).toBe(1);
    expect(result.llmFailed).toBe(1);
    expect(mockPrismaService.campExtractionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'invalid',
        }),
      }),
    );
  });
});
