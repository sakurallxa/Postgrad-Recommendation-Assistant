import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProgressDto, PROGRESS_STATUS_VALUES } from './dto/create-progress.dto';
import { UpdateProgressStatusDto } from './dto/update-progress-status.dto';
import { UpdateProgressSubscriptionDto } from './dto/update-progress-subscription.dto';
import {
  CreateProgressEventDto,
  PROGRESS_EVENT_TYPE_VALUES,
} from './dto/create-progress-event.dto';

type ProgressStatus = (typeof PROGRESS_STATUS_VALUES)[number];
type ProgressEventType = (typeof PROGRESS_EVENT_TYPE_VALUES)[number];

const STATUS_TRANSITIONS: Record<ProgressStatus, ProgressStatus[]> = {
  followed: ['preparing', 'submitted'],
  preparing: ['followed', 'submitted'],
  submitted: ['waiting_admission', 'admitted'],
  waiting_admission: ['submitted', 'admitted'],
  admitted: ['waiting_outstanding'],
  waiting_outstanding: ['admitted', 'outstanding_published'],
  outstanding_published: ['waiting_outstanding'],
};

const RESULT_WATCH_ALERTS: Record<string, { title: string; content: string; priority: string }> = {
  submitted: {
    title: '材料已提交，进入等待期',
    content: '建议从现在开始关注入营名单发布窗口，避免错过结果通知。',
    priority: 'normal',
  },
  waiting_admission: {
    title: '待入营名单，请持续关注',
    content: '你的申请已进入“待入营名单”阶段，建议每天至少检查一次结果。',
    priority: 'high',
  },
  waiting_outstanding: {
    title: '待优秀营员结果，请持续关注',
    content: '你已入营，当前处于“待优秀营员结果”阶段，请关注最新通知。',
    priority: 'high',
  },
};

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);
    const where: any = { userId };

    if (status && status !== 'all') {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.applicationProgress.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          camp: {
            select: {
              id: true,
              title: true,
              deadline: true,
              status: true,
              university: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          subscription: true,
        },
      }),
      this.prisma.applicationProgress.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findOne(userId: string, progressId: string) {
    const progress = await this.prisma.applicationProgress.findUnique({
      where: { id: progressId },
      include: {
        camp: {
          include: {
            university: {
              select: {
                id: true,
                name: true,
                website: true,
              },
            },
          },
        },
        subscription: true,
        statusLogs: {
          orderBy: { changedAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!progress) {
      throw new NotFoundException('申请进展不存在');
    }
    if (progress.userId !== userId) {
      throw new ForbiddenException('无权访问该申请进展');
    }

    return progress;
  }

  async create(userId: string, dto: CreateProgressDto) {
    const camp = await this.prisma.campInfo.findUnique({
      where: { id: dto.campId },
      include: {
        university: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!camp) {
      throw new NotFoundException('夏令营不存在');
    }

    const targetStatus = (dto.status || 'followed') as ProgressStatus;
    if (!PROGRESS_STATUS_VALUES.includes(targetStatus)) {
      throw new BadRequestException('无效的进展状态');
    }

    let progress = await this.prisma.applicationProgress.findUnique({
      where: {
        userId_campId: {
          userId,
          campId: dto.campId,
        },
      },
    });

    if (!progress) {
      progress = await this.prisma.applicationProgress.create({
        data: {
          userId,
          campId: dto.campId,
          status: targetStatus,
          nextAction: dto.nextAction,
          statusNote: dto.note,
          submittedAt: targetStatus === 'submitted' ? new Date() : null,
          admittedAt: targetStatus === 'admitted' ? new Date() : null,
          outstandingPublishedAt: targetStatus === 'outstanding_published' ? new Date() : null,
          lastStatusAt: new Date(),
        },
      });

      await this.prisma.progressStatusLog.create({
        data: {
          progressId: progress.id,
          fromStatus: null,
          toStatus: targetStatus,
          note: dto.note,
        },
      });
    } else if (dto.nextAction || dto.note) {
      progress = await this.prisma.applicationProgress.update({
        where: { id: progress.id },
        data: {
          nextAction: dto.nextAction ?? progress.nextAction ?? null,
          statusNote: dto.note ?? progress.statusNote ?? null,
        },
      });
    }

    await this.prisma.progressSubscription.upsert({
      where: { progressId: progress.id },
      update: {},
      create: {
        progressId: progress.id,
        userId,
      },
    });

    await this.createDeadlineStageAlerts(progress.id, userId, camp.title, camp.deadline);
    await this.createResultWatchAlert(progress.id, userId, targetStatus);

    return this.findOne(userId, progress.id);
  }

  async updateStatus(userId: string, progressId: string, dto: UpdateProgressStatusDto) {
    const progress = await this.assertProgressOwner(userId, progressId);
    const nextStatus = dto.status as ProgressStatus;

    this.validateStatusTransition(progress.status as ProgressStatus, nextStatus);

    const now = new Date();
    const data: any = {
      status: nextStatus,
      statusNote: dto.note ?? progress.statusNote,
      nextAction: dto.nextAction ?? progress.nextAction,
      lastStatusAt: now,
    };

    if (nextStatus === 'submitted' && !progress.submittedAt) {
      data.submittedAt = now;
    }
    if (nextStatus === 'admitted' && !progress.admittedAt) {
      data.admittedAt = now;
    }
    if (nextStatus === 'outstanding_published' && !progress.outstandingPublishedAt) {
      data.outstandingPublishedAt = now;
    }

    await this.prisma.$transaction([
      this.prisma.applicationProgress.update({
        where: { id: progressId },
        data,
      }),
      this.prisma.progressStatusLog.create({
        data: {
          progressId,
          fromStatus: progress.status,
          toStatus: nextStatus,
          note: dto.note,
        },
      }),
    ]);

    await this.createResultWatchAlert(progressId, userId, nextStatus);

    return this.findOne(userId, progressId);
  }

  async getSubscription(userId: string, progressId: string) {
    await this.assertProgressOwner(userId, progressId);
    const subscription = await this.prisma.progressSubscription.findUnique({
      where: { progressId },
    });
    if (!subscription) {
      return this.prisma.progressSubscription.create({
        data: {
          progressId,
          userId,
        },
      });
    }
    return subscription;
  }

  async updateSubscription(userId: string, progressId: string, dto: UpdateProgressSubscriptionDto) {
    await this.assertProgressOwner(userId, progressId);
    return this.prisma.progressSubscription.upsert({
      where: { progressId },
      update: {
        ...dto,
      },
      create: {
        progressId,
        userId,
        enabled: dto.enabled ?? true,
        deadlineChanged: dto.deadlineChanged ?? true,
        materialsChanged: dto.materialsChanged ?? true,
        admissionResultChanged: dto.admissionResultChanged ?? true,
        outstandingResultChanged: dto.outstandingResultChanged ?? true,
      },
    });
  }

  async listAlerts(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const where: any = { userId };
    if (status && status !== 'all') {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.progressAlert.findMany({
        where,
        skip,
        take,
        orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }],
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
          event: {
            select: {
              id: true,
              eventType: true,
              fieldName: true,
              oldValue: true,
              newValue: true,
              confidenceLabel: true,
              sourceType: true,
              sourceUpdatedAt: true,
            },
          },
        },
      }),
      this.prisma.progressAlert.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async handleAlert(userId: string, alertId: string) {
    const alert = await this.prisma.progressAlert.findUnique({
      where: { id: alertId },
    });
    if (!alert) {
      throw new NotFoundException('提醒不存在');
    }
    if (alert.userId !== userId) {
      throw new ForbiddenException('无权操作该提醒');
    }

    return this.prisma.progressAlert.update({
      where: { id: alertId },
      data: {
        status: 'handled',
        handledAt: new Date(),
      },
    });
  }

  async snoozeAlert(userId: string, alertId: string, hours: number = 24) {
    const alert = await this.prisma.progressAlert.findUnique({
      where: { id: alertId },
    });
    if (!alert) {
      throw new NotFoundException('提醒不存在');
    }
    if (alert.userId !== userId) {
      throw new ForbiddenException('无权操作该提醒');
    }

    const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

    return this.prisma.progressAlert.update({
      where: { id: alertId },
      data: {
        status: 'snoozed',
        snoozeUntil,
        scheduledAt: snoozeUntil,
      },
    });
  }

  async createChangeEvent(dto: CreateProgressEventDto) {
    const camp = await this.prisma.campInfo.findUnique({
      where: { id: dto.campId },
      select: { id: true, title: true },
    });
    if (!camp) {
      throw new NotFoundException('夏令营不存在');
    }

    const confidence = this.resolveConfidence(dto);

    const event = await this.prisma.progressChangeEvent.create({
      data: {
        campId: dto.campId,
        eventType: dto.eventType,
        fieldName: dto.fieldName,
        oldValue: dto.oldValue,
        newValue: dto.newValue,
        sourceType: dto.sourceType || 'crawler',
        sourceUrl: dto.sourceUrl,
        sourceUpdatedAt: dto.sourceUpdatedAt ? new Date(dto.sourceUpdatedAt) : null,
        confidenceLabel: confidence.label,
        confidenceScore: confidence.score,
      },
    });

    const progresses = await this.prisma.applicationProgress.findMany({
      where: { campId: dto.campId },
      include: {
        subscription: true,
      },
    });

    const relatedProgresses = progresses.filter((item) =>
      this.shouldNotifyBySubscription(dto.eventType, item.subscription),
    );

    if (relatedProgresses.length > 0) {
      await this.prisma.progressAlert.createMany({
        data: relatedProgresses.map((item) => ({
          userId: item.userId,
          progressId: item.id,
          campId: item.campId,
          eventId: event.id,
          type: 'change_event',
          title: this.buildEventAlertTitle(dto.eventType),
          content: this.buildEventAlertContent(camp.title, dto),
          priority: this.mapEventPriority(dto.eventType),
          confidenceLabel: confidence.label,
          status: 'pending',
          scheduledAt: new Date(),
        })),
      });
    }

    return {
      event,
      notifiedUsers: relatedProgresses.length,
      confidence,
    };
  }

  private async assertProgressOwner(userId: string, progressId: string) {
    const progress = await this.prisma.applicationProgress.findUnique({
      where: { id: progressId },
    });
    if (!progress) {
      throw new NotFoundException('申请进展不存在');
    }
    if (progress.userId !== userId) {
      throw new ForbiddenException('无权操作该申请进展');
    }
    return progress;
  }

  private validateStatusTransition(current: ProgressStatus, next: ProgressStatus) {
    if (current === next) {
      return;
    }
    const allowed = STATUS_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`状态流转不合法: ${current} -> ${next}`);
    }
  }

  private async createDeadlineStageAlerts(
    progressId: string,
    userId: string,
    campTitle: string,
    deadline: Date | null,
  ) {
    if (!deadline) {
      return;
    }

    const checkpoints = [7, 3, 1, 0];
    const now = new Date();

    for (const daysBefore of checkpoints) {
      const scheduledAt = new Date(deadline.getTime() - daysBefore * 24 * 60 * 60 * 1000);
      if (scheduledAt <= now) {
        continue;
      }
      const existing = await this.prisma.progressAlert.findFirst({
        where: {
          userId,
          progressId,
          type: 'deadline_stage',
          scheduledAt,
        },
      });
      if (existing) {
        continue;
      }
      await this.prisma.progressAlert.create({
        data: {
          userId,
          progressId,
          type: 'deadline_stage',
          title: `${campTitle} 截止提醒`,
          content: daysBefore === 0
            ? '今天就是截止日，请尽快完成最终确认。'
            : `距离截止还有 ${daysBefore} 天，请检查材料完整性。`,
          priority: daysBefore <= 1 ? 'urgent' : daysBefore <= 3 ? 'high' : 'normal',
          status: 'pending',
          scheduledAt,
        },
      });
    }
  }

  private async createResultWatchAlert(progressId: string, userId: string, status: ProgressStatus) {
    const config = RESULT_WATCH_ALERTS[status];
    if (!config) {
      return;
    }

    const recent = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const existing = await this.prisma.progressAlert.findFirst({
      where: {
        userId,
        progressId,
        type: 'result_watch',
        title: config.title,
        createdAt: { gte: recent },
      },
    });
    if (existing) {
      return;
    }

    await this.prisma.progressAlert.create({
      data: {
        userId,
        progressId,
        type: 'result_watch',
        title: config.title,
        content: config.content,
        priority: config.priority,
        status: 'pending',
        scheduledAt: new Date(),
      },
    });
  }

  private shouldNotifyBySubscription(
    eventType: ProgressEventType,
    subscription: {
      enabled: boolean;
      deadlineChanged: boolean;
      materialsChanged: boolean;
      admissionResultChanged: boolean;
      outstandingResultChanged: boolean;
    } | null,
  ) {
    if (!subscription) {
      return true;
    }
    if (!subscription.enabled) {
      return false;
    }
    if (eventType === 'deadline') {
      return subscription.deadlineChanged;
    }
    if (eventType === 'materials') {
      return subscription.materialsChanged;
    }
    if (eventType === 'admission_result') {
      return subscription.admissionResultChanged;
    }
    if (eventType === 'outstanding_result') {
      return subscription.outstandingResultChanged;
    }
    return true;
  }

  private resolveConfidence(dto: CreateProgressEventDto) {
    if (dto.confidenceLabel && typeof dto.confidenceScore === 'number') {
      return {
        label: dto.confidenceLabel,
        score: this.normalizeConfidenceScore(dto.confidenceScore),
      };
    }

    let score = 0.45;
    const sourceType = (dto.sourceType || 'crawler').toLowerCase();

    if (sourceType === 'system') {
      score = 0.88;
    } else if (sourceType === 'crawler') {
      score = 0.76;
    } else if (sourceType === 'manual') {
      score = 0.58;
    }

    if (dto.sourceUpdatedAt) {
      const hours = (Date.now() - new Date(dto.sourceUpdatedAt).getTime()) / (1000 * 60 * 60);
      if (hours <= 48) {
        score += 0.08;
      } else if (hours > 24 * 21) {
        score -= 0.08;
      }
    } else {
      score -= 0.04;
    }

    if (dto.fieldName && dto.newValue) {
      score += 0.04;
    } else if (!dto.newValue) {
      score -= 0.05;
    }

    const normalizedScore = this.normalizeConfidenceScore(score);
    return {
      label: normalizedScore >= 0.8 ? 'high' : normalizedScore >= 0.55 ? 'medium' : 'low',
      score: normalizedScore,
    };
  }

  private normalizeConfidenceScore(score: number) {
    if (score < 0) return 0;
    if (score > 1) return 1;
    return Number(score.toFixed(2));
  }

  private buildEventAlertTitle(eventType: ProgressEventType) {
    if (eventType === 'deadline') {
      return '截止时间有更新';
    }
    if (eventType === 'materials') {
      return '材料要求有更新';
    }
    if (eventType === 'admission_result') {
      return '入营名单有更新';
    }
    return '优秀营员结果有更新';
  }

  private buildEventAlertContent(campTitle: string, dto: CreateProgressEventDto) {
    const field = dto.fieldName ? `字段：${dto.fieldName}。` : '';
    const oldValue = dto.oldValue ? `原值：${dto.oldValue}。` : '';
    const newValue = dto.newValue ? `新值：${dto.newValue}。` : '';
    return `${campTitle} 检测到信息更新。${field}${oldValue}${newValue}`.trim();
  }

  private mapEventPriority(eventType: ProgressEventType) {
    if (eventType === 'deadline') {
      return 'urgent';
    }
    if (eventType === 'admission_result' || eventType === 'outstanding_result') {
      return 'high';
    }
    return 'normal';
  }
}
