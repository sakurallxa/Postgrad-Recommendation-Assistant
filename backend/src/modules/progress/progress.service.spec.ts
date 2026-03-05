import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProgressService', () => {
  let service: ProgressService;

  const mockPrismaService = {
    applicationProgress: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    progressSubscription: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    progressStatusLog: {
      create: jest.fn(),
    },
    progressAlert: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    progressChangeEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    campWatchSubscription: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    campInfo: {
      findUnique: jest.fn(),
    },
    userSelection: {
      findMany: jest.fn(),
    },
    userProfile: {
      findMany: jest.fn(),
    },
    reminder: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    jest.clearAllMocks();
  });

  it('状态流转非法时应抛出异常', async () => {
    mockPrismaService.applicationProgress.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      status: 'followed',
      submittedAt: null,
      admittedAt: null,
      outstandingPublishedAt: null,
      statusNote: null,
      nextAction: null,
    });

    await expect(
      service.updateStatus('u1', 'p1', {
        status: 'waiting_admission',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });

  it('变更事件应按订阅分发提醒', async () => {
    mockPrismaService.campInfo.findUnique.mockResolvedValue({
      id: 'camp_1',
      title: '测试夏令营',
    });
    mockPrismaService.progressChangeEvent.findUnique.mockResolvedValue(null);
    mockPrismaService.progressChangeEvent.create.mockResolvedValue({
      id: 'evt_1',
      campId: 'camp_1',
      eventType: 'deadline',
    });
    mockPrismaService.applicationProgress.findMany.mockResolvedValue([
      {
        id: 'p_1',
        userId: 'u_1',
        campId: 'camp_1',
        subscription: {
          enabled: true,
          deadlineChanged: true,
          materialsChanged: true,
          admissionResultChanged: true,
          outstandingResultChanged: true,
        },
      },
    ]);
    mockPrismaService.campWatchSubscription.findMany.mockResolvedValue([
      {
        id: 'w_1',
        userId: 'u_1',
        campId: 'camp_1',
        enabled: true,
        inAppEnabled: true,
        wechatEnabled: false,
        deadlineChanged: true,
        materialsChanged: true,
        admissionResultChanged: true,
        outstandingResultChanged: true,
      },
      {
        id: 'w_2',
        userId: 'u_2',
        campId: 'camp_1',
        enabled: true,
        inAppEnabled: true,
        wechatEnabled: false,
        deadlineChanged: false,
        materialsChanged: true,
        admissionResultChanged: true,
        outstandingResultChanged: true,
      },
    ]);
    mockPrismaService.reminder.findMany.mockResolvedValue([]);
    mockPrismaService.progressAlert.findUnique.mockResolvedValue(null);
    mockPrismaService.progressAlert.create.mockResolvedValue({ id: 'a_1' });
    mockPrismaService.userSelection.findMany.mockResolvedValue([]);
    mockPrismaService.userProfile.findMany.mockResolvedValue([]);

    const result = await service.createChangeEvent({
      campId: 'camp_1',
      eventType: 'deadline',
      fieldName: 'deadline',
      oldValue: '2026-03-10',
      newValue: '2026-03-08',
      sourceType: 'crawler',
      sourceUpdatedAt: '2026-03-01T10:00:00.000Z',
    });

    expect(result.notifiedUsers).toBe(1);
    expect(mockPrismaService.progressAlert.create).toHaveBeenCalledTimes(1);
  });
});
