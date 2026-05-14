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
    expect(result.eventsCreated).toBeGreaterThanOrEqual(1);
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
          process: '[]',
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
      // title 会由规则结果补齐；这里用非法枚举触发 schema 校验失败
      title: '电子信息学院2026年夏令营',
      announcementType: 'invalid_type',
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

  it('ingestCamps: 全量 LLM 模式下应以 DeepSeek 结果优先覆盖语义字段', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'DEEPSEEK_COMPARE_ENABLED') return 'true';
      return defaultValue;
    });
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_compare_1' });
    mockPrismaService.campExtractionLog.create.mockResolvedValue({ id: 'extract_log_compare_1' });
    mockDeepSeekService.extractCampInfo.mockResolvedValue({
      title: '材料学院2026年夏令营',
      announcementType: 'summer_camp',
      location: '北京市海淀区学院路30号',
      requirements: { english: 'CET-6 500分以上' },
      materials: ['推荐信'],
      process: ['复试'],
      contact: { email: 'camp@test.edu.cn' },
      confidence: 0.92,
    });

    await service.ingestCamps([
      {
        title: '材料学院2026年夏令营',
        announcementType: 'summer_camp',
        universityId: 'uni_compare_1',
        sourceUrl: 'https://example.com/notice/compare',
        content: '夏令营通知正文',
        confidence: 0.88,
        materials: ['成绩单'],
        process: ['报名'],
        requirements: { gradeRank: '前20%' },
      },
    ]);

    expect(mockDeepSeekService.extractCampInfo).toHaveBeenCalled();
    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          materials: expect.stringContaining('推荐信'),
          process: '[]',
          contact: expect.stringContaining('camp@test.edu.cn'),
        }),
      }),
    );
    expect(mockPrismaService.campInfo.create.mock.calls[0][0].data.materials).not.toContain('成绩单');
    expect(mockPrismaService.campInfo.create.mock.calls[0][0].data.process).toBe('[]');
    expect(mockPrismaService.campExtractionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'success',
          parsedResult: expect.stringContaining('mergeReasons'),
        }),
      }),
    );
  });

  it('ingestCamps: 规则已有语义字段时也应强制触发 DeepSeek 结构化', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_force_llm_1' });
    mockPrismaService.campExtractionLog.create.mockResolvedValue({ id: 'extract_log_force_llm_1' });
    mockDeepSeekService.extractCampInfo.mockResolvedValue({
      title: '自动化学院2026年夏令营',
      announcementType: 'summer_camp',
      requirements: {
        hardConstraints: [{ title: '成绩要求', content: '前20%' }],
        softSuggestions: [],
        uncertainItems: [],
      },
      materials: [{ title: '成绩单', detail: '', required: true }],
      process: [{ step: 1, action: '提交申请', note: '登录系统填报' }],
      contact: {},
      confidence: 0.9,
    });

    const result = await service.ingestCamps([
      {
        title: '自动化学院2026年夏令营',
        announcementType: 'summer_camp',
        universityId: 'uni_force_llm_1',
        sourceUrl: 'https://example.com/notice/force-llm',
        content: '夏令营通知正文',
        confidence: 0.95,
        materials: ['个人简历'],
        process: ['报名'],
        requirements: { gradeRank: '前10%' },
      },
    ]);

    expect(result.llmTriggered).toBe(1);
    expect(result.llmSuccess).toBe(1);
    expect(mockDeepSeekService.extractCampInfo).toHaveBeenCalled();
    expect(mockPrismaService.campInfo.create.mock.calls[0][0].data.process).toContain('提交申请');
    expect(mockPrismaService.campInfo.create.mock.calls[0][0].data.process).not.toContain('报名');
  });

  it('ingestCamps: 低质量流程应触发 DeepSeek 并以结构化结果替换', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'DEEPSEEK_COMPARE_ENABLED') return 'true';
      return defaultValue;
    });
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_process_llm_1' });
    mockPrismaService.campExtractionLog.create.mockResolvedValue({ id: 'extract_log_process_1' });
    mockDeepSeekService.extractCampInfo.mockResolvedValue({
      title: '软件学院2026年夏令营',
      announcementType: 'summer_camp',
      requirements: {
        hardConstraints: [{ title: '成绩要求', content: '前20%' }],
        softSuggestions: [],
        uncertainItems: [],
      },
      materials: [{ title: '成绩单', detail: '加盖公章', required: true }],
      process: [
        { step: 1, action: '网上报名', deadline: '2026-06-25 23:59', note: '登录系统提交信息' },
        { step: 2, action: '提交材料', note: '按要求上传附件' },
      ],
      contact: { email: 'camp@test.edu.cn' },
      confidence: 0.91,
    });

    await service.ingestCamps([
      {
        title: '软件学院2026年夏令营',
        announcementType: 'summer_camp',
        universityId: 'uni_process_bad_1',
        sourceUrl: 'https://example.com/notice/process-bad',
        content: '公告正文，包含申请流程、申请材料、联系方式。',
        confidence: 0.82,
        process: [
          '2026年推免招生简章要求及推免复试考核结果，尚空余部分推免招生指标，现接受推免生补充报名，请考生',
          '” （网址:http://yz.chsi.com.cn/tm）进行网上报名',
        ],
        materials: ['个人简历'],
        requirements: { note: '详见原文' },
      },
    ]);

    expect(mockDeepSeekService.extractCampInfo).toHaveBeenCalled();
    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          process: expect.stringContaining('网上报名'),
        }),
      }),
    );
    expect(mockPrismaService.campInfo.create.mock.calls[0][0].data.process).not.toContain('推免招生简章要求及推免复试考核结果');
  });

  it('ingestCamps: 字符串碎片流程在 LLM 返回对象步骤时应整段替换', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'DEEPSEEK_FALLBACK_ENABLED') return 'true';
      return defaultValue;
    });
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_process_replace_1' });
    mockPrismaService.campExtractionLog.create.mockResolvedValue({ id: 'extract_log_process_replace_1' });
    mockDeepSeekService.extractCampInfo.mockResolvedValue({
      title: '空军军医大学2026年推免生接收章程',
      announcementType: 'pre_recommendation',
      requirements: {
        hardConstraints: [{ title: '资格要求', content: '获得推免资格' }],
        softSuggestions: [],
        uncertainItems: [],
      },
      materials: [],
      process: [
        { step: 1, action: '网上报名', note: '登录推免服务系统提交信息' },
        { step: 2, action: '确认录取意向', note: '按要求回复录取意向' },
      ],
      contact: {},
      confidence: 0.95,
    });

    await service.ingestCamps([
      {
        title: '空军军医大学2026年推免生接收章程',
        announcementType: 'pre_recommendation',
        universityId: 'uni_process_replace_1',
        sourceUrl: 'https://example.com/notice/process-replace',
        content: '公告正文，包含推免报名、复试与录取安排。',
        confidence: 0.82,
        process: [
          '符合申请条件的申请者登录',
          '，开通时间以教育部公布时间为准）进行网上报名。',
          '复试通知',
          '正式录取通知书将于',
        ],
        materials: [],
        requirements: {
          note: '详见原文',
        },
      },
    ]);

    const savedProcess = mockPrismaService.campInfo.create.mock.calls[0][0].data.process;
    expect(savedProcess).toContain('网上报名');
    expect(savedProcess).toContain('确认录取意向');
    expect(savedProcess).not.toContain('符合申请条件的申请者登录');
    expect(savedProcess).not.toContain('正式录取通知书将于');
  });

  it('ingestCamps: 纯字符串流程不应作为结构化流程入库', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_process_plain_text_1' });

    await service.ingestCamps([
      {
        title: '某学院2026年夏令营通知',
        announcementType: 'summer_camp',
        universityId: 'uni_process_plain_text_1',
        sourceUrl: 'https://example.com/notice/process-plain-text',
        process: ['关于举办某学院2026年夏令营的通知'],
      },
    ]);

    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          process: '[]',
        }),
      }),
    );
  });

  it('ingestCamps: 标题句式对象步骤不应作为流程步骤入库', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_process_title_like_1' });

    await service.ingestCamps([
      {
        title: '某学院2026年预推免通知',
        announcementType: 'pre_recommendation',
        universityId: 'uni_process_title_like_1',
        sourceUrl: 'https://example.com/notice/process-title-like',
        process: [
          {
            step: 1,
            action: '关于调整我校生物学专业部分方向2026年硕士研究生招生考试初试科目的通知',
            note: '',
          },
        ],
      },
    ]);

    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          process: '[]',
        }),
      }),
    );
  });

  it('ingestCamps: 壳标题应被服务端兜底过滤', async () => {
    const result = await service.ingestCamps([
      {
        title: '夏令营',
        announcementType: 'summer_camp',
        universityId: 'uni_shell_1',
        sourceUrl: 'https://example.com/noise/1',
      },
    ]);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrismaService.campInfo.create).not.toHaveBeenCalled();
  });

  it('ingestCamps: 博士和港澳台等噪声公告应被服务端兜底过滤', async () => {
    const result = await service.ingestCamps([
      {
        title: '复旦大学2026年面向港澳台地区招收攻读博士学位研究生专业目录',
        announcementType: 'summer_camp',
        universityId: 'uni_noise_1',
        sourceUrl: 'https://example.com/noise/2',
      },
    ]);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrismaService.campInfo.create).not.toHaveBeenCalled();
  });

  it('ingestCamps: 标题应清洗栏目词和发布日期尾巴后再入库', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_clean_1' });

    const result = await service.ingestCamps([
      {
        title:
          '学工动态 学工动态 北京大学基础医学院关于举办 “2025年全国优秀大学生夏令营”的通知 发布日期：2025-06-12 为促进交流',
        announcementType: 'summer_camp',
        universityId: 'uni_clean_1',
        sourceUrl: 'https://example.com/notice/clean-title',
      },
    ]);

    expect(result.created).toBe(1);
    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: '北京大学基础医学院关于举办 “2025年全国优秀大学生夏令营”的通知',
        }),
      }),
    );
  });

  it('ingestCamps: 联系方式中的短电话和短地址应被过滤', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_contact_1' });

    await service.ingestCamps([
      {
        title: '北京大学第一医院关于举办“2025年全国优秀大学生夏令营”的通知',
        announcementType: 'summer_camp',
        universityId: 'uni_contact_1',
        sourceUrl: 'https://example.com/notice/contact',
        contact: {
          email: 'camp@test.edu.cn',
          phone: '19638859',
          address: '北京市',
        },
      },
    ]);

    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contact: JSON.stringify({
            email: 'camp@test.edu.cn',
          }),
        }),
      }),
    );
  });

  it('ingestCamps: 合法举办地点应入库，无效地点应过滤', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_location_1' });

    await service.ingestCamps([
      {
        title: '北京大学药学院关于举办“2025年全国优秀大学生夏令营”的通知',
        announcementType: 'summer_camp',
        universityId: 'uni_location_1',
        sourceUrl: 'https://example.com/notice/location',
        location: '北京市海淀区学院路38号北京大学医学部',
      },
      {
        title: '北京大学第一医院关于举办“2025年全国优秀大学生夏令营”的通知',
        announcementType: 'summer_camp',
        universityId: 'uni_location_2',
        sourceUrl: 'https://example.com/notice/location-2',
        location: '北京市',
      },
    ]);

    expect(mockPrismaService.campInfo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          location: '北京市海淀区学院路38号北京大学医学部',
        }),
      }),
    );
    expect(mockPrismaService.campInfo.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          location: null,
        }),
      }),
    );
  });

  it('ingestCamps: 代码片段型流程和材料不应入库或产出变更事件', async () => {
    mockPrismaService.campInfo.findFirst.mockResolvedValue(null);
    mockPrismaService.campInfo.create.mockResolvedValue({ id: 'camp_code_1' });

    const result = await service.ingestCamps([
      {
        title: '北京大学第一医院关于举办“2025年全国优秀大学生夏令营”的通知',
        announcementType: 'summer_camp',
        universityId: 'uni_code_1',
        sourceUrl: 'https://example.com/notice/code',
        materials: ['var urlStr = window.location.href;'],
        process: ['$(document).ready(function () {})'],
      },
    ]);

    expect(result.created).toBe(1);
    expect(mockPrismaService.campInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          materials: JSON.stringify([]),
          process: JSON.stringify([]),
        }),
      }),
    );
  });
});
