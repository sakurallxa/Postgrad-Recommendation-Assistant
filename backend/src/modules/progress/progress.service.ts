import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProgressDto, PROGRESS_STATUS_VALUES } from './dto/create-progress.dto';
import { UpdateProgressStatusDto } from './dto/update-progress-status.dto';
import { UpdateProgressSubscriptionDto } from './dto/update-progress-subscription.dto';
import {
  CreateProgressEventDto,
  PROGRESS_EVENT_TYPE_VALUES,
} from './dto/create-progress-event.dto';
import { ConfirmProgressStepDto } from './dto/confirm-progress-step.dto';

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

const SCHOOL_WECHAT_MERGE_HOURS = 24;
const SCHOOL_WECHAT_MERGE_MARKER = '（24小时内同校同类型更新已合并）';
const MATCH_AUTO_THRESHOLD = 0.9;
const MATCH_CONFIRM_THRESHOLD = 0.65;

interface ResultEntryCandidate {
  nameRaw: string;
  schoolRaw?: string;
  majorRaw?: string;
  aux?: Record<string, any>;
  sourceSnippet?: string;
}

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private isAutoMatchEnabled() {
    return String(process.env.AUTO_MATCH_ENABLED || 'true').toLowerCase() === 'true';
  }

  private isAutoProgressHighConfEnabled() {
    return String(process.env.AUTO_PROGRESS_HIGH_CONF_ENABLED || 'false').toLowerCase() === 'true';
  }

  private isWechatActionTokenEnabled() {
    return String(process.env.WECHAT_ACTION_TOKEN_ENABLED || 'false').toLowerCase() === 'true';
  }

  private parseStringArray(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  private parseUniversityIds(raw: string | null | undefined): string[] {
    return this.parseStringArray(raw);
  }

  private parseMajorIds(raw: string | null | undefined): string[] {
    return this.parseStringArray(raw);
  }

  private normalizeKeywords(value?: string | null): string[] {
    if (typeof value !== 'string') return [];
    return value
      .split(/[、,，/\\\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .filter((item, index, arr) => arr.indexOf(item) === index);
  }

  private async buildUserMajorConstraintMap(userIds: string[]) {
    const normalizedUserIds = Array.from(
      new Set((userIds || []).map((item) => String(item || '').trim()).filter(Boolean)),
    );
    if (normalizedUserIds.length === 0) {
      return new Map<string, {
        majorIds: string[];
        majorKeywords: string[];
        directionKeywords: string[];
      }>();
    }

    const [selections, profiles] = await Promise.all([
      this.prisma.userSelection.findMany({
        where: {
          userId: { in: normalizedUserIds },
        },
        select: {
          userId: true,
          majorIds: true,
        },
      }),
      this.prisma.userProfile.findMany({
        where: {
          userId: { in: normalizedUserIds },
        },
        select: {
          userId: true,
          major: true,
          preferredDirection: true,
        },
      }),
    ]);

    const selectionMap = new Map(
      selections.map((item) => [item.userId, this.parseMajorIds(item.majorIds)]),
    );
    const profileMap = new Map(
      profiles.map((item) => [item.userId, {
        majorKeywords: this.normalizeKeywords(item.major),
        directionKeywords: this.normalizeKeywords(item.preferredDirection),
      }]),
    );

    const map = new Map<string, {
      majorIds: string[];
      majorKeywords: string[];
      directionKeywords: string[];
    }>();
    normalizedUserIds.forEach((userId) => {
      const majorIds = selectionMap.get(userId) || [];
      const profile = profileMap.get(userId) || { majorKeywords: [], directionKeywords: [] };
      map.set(userId, {
        majorIds,
        majorKeywords: profile.majorKeywords,
        directionKeywords: profile.directionKeywords,
      });
    });
    return map;
  }

  private isSchoolDefaultRecipientProfessionMatched(
    recipient: {
      userId: string;
      sourceType?: string;
    },
    campContext: {
      majorId?: string | null;
      majorName?: string | null;
      title?: string | null;
    },
    userConstraintMap: Map<string, {
      majorIds: string[];
      majorKeywords: string[];
      directionKeywords: string[];
    }>,
  ): boolean {
    if (recipient.sourceType !== 'school_default') {
      return true;
    }

    const constraints = userConstraintMap.get(recipient.userId);
    if (!constraints) {
      return false;
    }

    const hasConstraints = (
      constraints.majorIds.length > 0 ||
      constraints.majorKeywords.length > 0 ||
      constraints.directionKeywords.length > 0
    );
    if (!hasConstraints) {
      return false;
    }

    if (campContext.majorId && constraints.majorIds.includes(campContext.majorId)) {
      return true;
    }

    const haystack = `${campContext.title || ''} ${campContext.majorName || ''}`.toLowerCase();
    if (!haystack) {
      return false;
    }

    if (constraints.majorKeywords.some((keyword) => haystack.includes(keyword))) {
      return true;
    }

    if (constraints.directionKeywords.some((keyword) => haystack.includes(keyword))) {
      return true;
    }

    return false;
  }

  private shouldSendWechatByLayer(
    eventType: ProgressEventType,
    recipient: {
      wechatEnabled: boolean;
      sourceType?: string;
    },
  ): boolean {
    if (!recipient.wechatEnabled) {
      return false;
    }

    if (recipient.sourceType === 'school_default') {
      return (
        eventType === 'deadline' ||
        eventType === 'admission_result' ||
        eventType === 'outstanding_result'
      );
    }

    return true;
  }

  private async createWechatAlertWithSchoolMerge(params: {
    userId: string;
    progressId?: string;
    campId?: string;
    eventId?: string;
    type: string;
    title: string;
    content: string;
    priority: string;
    confidenceLabel?: string;
    eventType: ProgressEventType;
    sourceType?: string;
    universityId?: string;
  }) {
    const shouldMergeBySchool = params.sourceType === 'school_default' && Boolean(params.universityId);
    if (shouldMergeBySchool) {
      const recentAt = new Date(Date.now() - SCHOOL_WECHAT_MERGE_HOURS * 60 * 60 * 1000);
      const recentAlert = await this.prisma.progressAlert.findFirst({
        where: {
          userId: params.userId,
          channel: 'wechat',
          type: 'change_event',
          createdAt: { gte: recentAt },
          camp: {
            universityId: params.universityId,
          },
          event: {
            eventType: params.eventType,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
        },
      });

      if (recentAlert) {
        const nextContent = String(recentAlert.content || '').includes(SCHOOL_WECHAT_MERGE_MARKER)
          ? null
          : `${recentAlert.content || ''}${SCHOOL_WECHAT_MERGE_MARKER}`;
        if (nextContent) {
          await this.prisma.progressAlert.update({
            where: { id: recentAlert.id },
            data: { content: nextContent },
          });
        }
        return;
      }
    }

    await this.createAlertIfAbsent({
      userId: params.userId,
      progressId: params.progressId,
      campId: params.campId,
      eventId: params.eventId,
      type: params.type,
      title: params.title,
      content: params.content,
      priority: params.priority,
      confidenceLabel: params.confidenceLabel,
      channel: 'wechat',
      sendStatus: 'pending',
    });
  }

  private async findUserIdsByUniversitySelection(universityId: string): Promise<string[]> {
    if (!universityId) return [];
    const selectionCandidates = await this.prisma.userSelection.findMany({
      where: {
        universityIds: {
          contains: `"${universityId}"`,
        },
      },
      select: {
        userId: true,
        universityIds: true,
      },
    });

    return selectionCandidates
      .filter((item) => this.parseUniversityIds(item.universityIds).includes(universityId))
      .map((item) => item.userId);
  }

  private buildWatchKey(userId: string, campId: string): string {
    return `${userId}::${campId}`;
  }

  private async ensureSchoolDefaultWatchSubscriptions(
    userIds: string[],
    campIds: string[],
  ): Promise<void> {
    const normalizedUserIds = Array.from(
      new Set((userIds || []).map((item) => String(item || '').trim()).filter(Boolean)),
    );
    const normalizedCampIds = Array.from(
      new Set((campIds || []).map((item) => String(item || '').trim()).filter(Boolean)),
    );
    if (normalizedUserIds.length === 0) return;
    if (normalizedCampIds.length === 0) return;

    const existing = await this.prisma.campWatchSubscription.findMany({
      where: {
        userId: { in: normalizedUserIds },
        campId: { in: normalizedCampIds },
      },
      select: {
        userId: true,
        campId: true,
        sourceType: true,
      },
    });

    const existingMap = new Map<string, { sourceType: string }>();
    existing.forEach((item) => {
      existingMap.set(this.buildWatchKey(item.userId, item.campId), {
        sourceType: item.sourceType || '',
      });
    });

    const toCreate: Array<{
      userId: string;
      campId: string;
      sourceType: string;
      enabled: boolean;
      deadlineChanged: boolean;
      materialsChanged: boolean;
      admissionResultChanged: boolean;
      outstandingResultChanged: boolean;
      inAppEnabled: boolean;
      wechatEnabled: boolean;
    }> = [];

    normalizedUserIds.forEach((userId) => {
      normalizedCampIds.forEach((campId) => {
        const key = this.buildWatchKey(userId, campId);
        if (!existingMap.has(key)) {
          toCreate.push({
            userId,
            campId,
            sourceType: 'school_default',
            enabled: true,
            deadlineChanged: true,
            materialsChanged: true,
            admissionResultChanged: true,
            outstandingResultChanged: true,
            inAppEnabled: true,
            wechatEnabled: true,
          });
        }
      });
    });

    if (toCreate.length > 0) {
      await this.prisma.campWatchSubscription.createMany({
        data: toCreate,
      });
    }

  }

  async syncSchoolDefaultSubscriptionsForUserSelection(
    userId: string,
    addedUniversityIds: string[] = [],
    removedUniversityIds: string[] = [],
  ): Promise<void> {
    if (!userId) return;

    const normalizedAdded = Array.from(
      new Set((addedUniversityIds || []).map((item) => String(item || '').trim()).filter(Boolean)),
    );
    const normalizedRemoved = Array.from(
      new Set((removedUniversityIds || []).map((item) => String(item || '').trim()).filter(Boolean)),
    );

    if (normalizedAdded.length > 0) {
      const camps = await this.prisma.campInfo.findMany({
        where: {
          universityId: { in: normalizedAdded },
          status: 'published',
        },
        select: { id: true },
      });
      await this.ensureSchoolDefaultWatchSubscriptions(
        [userId],
        camps.map((item) => item.id),
      );
      await this.prisma.campWatchSubscription.updateMany({
        where: {
          userId,
          sourceType: 'school_default',
          camp: {
            universityId: { in: normalizedAdded },
          },
        },
        data: {
          enabled: true,
          deadlineChanged: true,
          materialsChanged: true,
          admissionResultChanged: true,
          outstandingResultChanged: true,
          inAppEnabled: true,
          wechatEnabled: true,
        },
      });
    }

    if (normalizedRemoved.length > 0) {
      const camps = await this.prisma.campInfo.findMany({
        where: {
          universityId: { in: normalizedRemoved },
        },
        select: { id: true },
      });
      const campIds = camps.map((item) => item.id);
      if (campIds.length > 0) {
        await this.prisma.campWatchSubscription.updateMany({
          where: {
            userId,
            campId: { in: campIds },
            sourceType: 'school_default',
          },
          data: {
            enabled: false,
          },
        });
      }
    }
  }

  async applySchoolDefaultSubscriptionsForCamp(campId: string, universityId: string): Promise<void> {
    if (!campId || !universityId) return;
    const userIds = await this.findUserIdsByUniversitySelection(universityId);
    if (userIds.length === 0) return;
    await this.ensureSchoolDefaultWatchSubscriptions(userIds, [campId]);
  }

  async getSchoolSubscriptions(userId: string) {
    const selection = await this.prisma.userSelection.findUnique({
      where: { userId },
      select: { universityIds: true },
    });
    const universityIds = this.parseUniversityIds(selection?.universityIds);
    if (universityIds.length === 0) {
      return [];
    }

    const [universities, campStats, subscriptions] = await Promise.all([
      this.prisma.university.findMany({
        where: { id: { in: universityIds } },
        select: {
          id: true,
          name: true,
          level: true,
        },
      }),
      this.prisma.campInfo.groupBy({
        by: ['universityId'],
        where: {
          universityId: { in: universityIds },
          status: 'published',
        },
        _count: { _all: true },
      }),
      this.prisma.campWatchSubscription.findMany({
        where: {
          userId,
          sourceType: 'school_default',
          camp: {
            universityId: { in: universityIds },
          },
        },
        select: {
          enabled: true,
          deadlineChanged: true,
          materialsChanged: true,
          admissionResultChanged: true,
          outstandingResultChanged: true,
          camp: {
            select: {
              universityId: true,
            },
          },
        },
      }),
    ]);

    const universityMap = new Map(universities.map((item) => [item.id, item]));
    const campCountMap = new Map(campStats.map((item) => [item.universityId, item._count._all]));
    const groupedSubscriptionMap = new Map<
      string,
      Array<{
        enabled: boolean;
        deadlineChanged: boolean;
        materialsChanged: boolean;
        admissionResultChanged: boolean;
        outstandingResultChanged: boolean;
      }>
    >();

    subscriptions.forEach((item) => {
      const universityId = item.camp?.universityId;
      if (!universityId) return;
      if (!groupedSubscriptionMap.has(universityId)) {
        groupedSubscriptionMap.set(universityId, []);
      }
      groupedSubscriptionMap.get(universityId)?.push({
        enabled: item.enabled,
        deadlineChanged: item.deadlineChanged,
        materialsChanged: item.materialsChanged,
        admissionResultChanged: item.admissionResultChanged,
        outstandingResultChanged: item.outstandingResultChanged,
      });
    });

    return universityIds
      .map((universityId) => {
        const university = universityMap.get(universityId);
        if (!university) return null;
        const schoolSubscriptions = groupedSubscriptionMap.get(universityId) || [];
        const mergedSubscription = schoolSubscriptions.length === 0
          ? {
            enabled: true,
            deadlineChanged: true,
            materialsChanged: true,
            admissionResultChanged: true,
            outstandingResultChanged: true,
          }
          : {
            enabled: schoolSubscriptions.every((item) => item.enabled),
            deadlineChanged: schoolSubscriptions.every((item) => item.deadlineChanged),
            materialsChanged: schoolSubscriptions.every((item) => item.materialsChanged),
            admissionResultChanged: schoolSubscriptions.every((item) => item.admissionResultChanged),
            outstandingResultChanged: schoolSubscriptions.every((item) => item.outstandingResultChanged),
          };

        return {
          universityId,
          universityName: university.name,
          universityLevel: university.level || '',
          totalPublishedCampCount: campCountMap.get(universityId) || 0,
          managedSubscriptionCampCount: schoolSubscriptions.length,
          subscription: mergedSubscription,
        };
      })
      .filter(Boolean);
  }

  async updateSchoolSubscription(
    userId: string,
    universityId: string,
    dto: UpdateProgressSubscriptionDto,
  ) {
    const selection = await this.prisma.userSelection.findUnique({
      where: { userId },
      select: { universityIds: true },
    });
    const selectedUniversityIds = this.parseUniversityIds(selection?.universityIds);
    if (!selectedUniversityIds.includes(universityId)) {
      throw new BadRequestException('该院校未在关注列表中');
    }

    const updateData: any = {};
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
    if (dto.deadlineChanged !== undefined) updateData.deadlineChanged = dto.deadlineChanged;
    if (dto.materialsChanged !== undefined) updateData.materialsChanged = dto.materialsChanged;
    if (dto.admissionResultChanged !== undefined) {
      updateData.admissionResultChanged = dto.admissionResultChanged;
    }
    if (dto.outstandingResultChanged !== undefined) {
      updateData.outstandingResultChanged = dto.outstandingResultChanged;
    }
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('缺少可更新的订阅字段');
    }

    await this.syncSchoolDefaultSubscriptionsForUserSelection(userId, [universityId], []);
    await this.prisma.campWatchSubscription.updateMany({
      where: {
        userId,
        sourceType: 'school_default',
        camp: {
          universityId,
        },
      },
      data: updateData,
    });

    const schoolSubscriptions = await this.getSchoolSubscriptions(userId);
    return schoolSubscriptions.find((item) => item.universityId === universityId) || null;
  }

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
        matchCandidates: {
          orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
          take: 5,
          include: {
            event: {
              select: {
                id: true,
                eventType: true,
                fieldName: true,
                sourceUpdatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!progress) {
      throw new NotFoundException('申请进展不存在');
    }
    if (progress.userId !== userId) {
      throw new ForbiddenException('无权访问该申请进展');
    }

    const recentMatchEvidence = (progress.matchCandidates || []).map((item) => ({
      id: item.id,
      decision: item.decision,
      confidenceLabel: item.matchConfidenceLabel,
      confidenceScore: item.matchConfidenceScore,
      decidedAt: item.decidedAt,
      event: item.event,
      features: this.safeParseJson(item.featuresJson),
    }));

    return {
      ...progress,
      recentMatchEvidence,
    };
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

      await this.createStatusLog({
        progressId: progress.id,
        fromStatus: null,
        toStatus: targetStatus,
        note: dto.note,
        sourceType: 'manual_follow',
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
    await this.upsertCampWatchSubscriptionByProgress(userId, dto.campId);

    await this.createDeadlineStageAlerts(progress.id, userId, camp.title, camp.deadline);
    await this.createResultWatchAlert(progress.id, userId, targetStatus);

    return this.findOne(userId, progress.id);
  }

  async removeProgress(userId: string, progressId: string) {
    const progress = await this.assertProgressOwner(userId, progressId);
    return this.unfollowByCamp(userId, progress.campId);
  }

  async unfollowByCamp(userId: string, campId: string) {
    const progress = await this.prisma.applicationProgress.findUnique({
      where: {
        userId_campId: {
          userId,
          campId,
        },
      },
      select: {
        id: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (progress?.id) {
        await tx.applicationProgress.delete({
          where: { id: progress.id },
        });
      }

      await tx.reminder.deleteMany({
        where: { userId, campId },
      });

      await tx.progressAlert.deleteMany({
        where: { userId, campId },
      });

      await tx.campWatchSubscription.upsert({
        where: {
          userId_campId: {
            userId,
            campId,
          },
        },
        create: {
          userId,
          campId,
          sourceType: 'manual_opt_out',
          enabled: false,
          inAppEnabled: false,
          wechatEnabled: false,
          deadlineChanged: false,
          materialsChanged: false,
          admissionResultChanged: false,
          outstandingResultChanged: false,
        },
        update: {
          sourceType: 'manual_opt_out',
          enabled: false,
          inAppEnabled: false,
          wechatEnabled: false,
          deadlineChanged: false,
          materialsChanged: false,
          admissionResultChanged: false,
          outstandingResultChanged: false,
        },
      });
    });

    return {
      campId,
      progressRemoved: Boolean(progress?.id),
      reminderRemoved: true,
      subscriptionEnabled: false,
    };
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

    await this.prisma.applicationProgress.update({
      where: { id: progressId },
      data,
    });
    await this.createStatusLog({
      progressId,
      fromStatus: progress.status,
      toStatus: nextStatus,
      note: dto.note,
      sourceType: 'manual',
    });

    await this.createResultWatchAlert(progressId, userId, nextStatus);

    return this.findOne(userId, progressId);
  }

  async confirmStep(userId: string, progressId: string, dto: ConfirmProgressStepDto) {
    const progress = await this.assertProgressOwner(userId, progressId);
    const nextStatus = dto.status as ProgressStatus;
    this.validateStatusTransition(progress.status as ProgressStatus, nextStatus);

    const updated = await this.promoteProgressStatus({
      progress,
      nextStatus,
      note: dto.note || '用户确认推进状态',
      sourceType: 'confirm',
      sourceEventId: undefined,
      idempotencyKey: this.hashParts([progress.id, nextStatus, userId, 'confirm']),
      evidence: {
        via: 'confirm-step',
      },
    });

    return this.findOne(userId, updated.id);
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
    const subscription = await this.prisma.progressSubscription.upsert({
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
    const progress = await this.prisma.applicationProgress.findUnique({
      where: { id: progressId },
      select: { campId: true },
    });
    if (progress?.campId) {
      await this.upsertCampWatchSubscriptionByProgress(userId, progress.campId, dto);
    }
    return subscription;
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
          progress: {
            select: {
              status: true,
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

  async consumeActionToken(token: string) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      throw new BadRequestException('token 不能为空');
    }

    const alert = await this.prisma.progressAlert.findUnique({
      where: { actionToken: normalizedToken },
      include: {
        progress: true,
      },
    });
    if (!alert) {
      throw new NotFoundException('动作 token 不存在');
    }
    if (!alert.actionType) {
      throw new BadRequestException('该 token 不可执行');
    }
    if (alert.actionExpireAt && alert.actionExpireAt.getTime() < Date.now()) {
      throw new BadRequestException('动作 token 已过期');
    }
    if (alert.status === 'handled') {
      return {
        consumed: false,
        alreadyHandled: true,
        progressId: alert.progressId,
      };
    }

    const payload = this.safeParseJson(alert.actionPayloadJson) || {};
    const targetStatus = this.normalizeConfirmableStatus(payload.targetStatus);
    if (!targetStatus) {
      throw new BadRequestException('动作载荷缺失目标状态');
    }
    if (!alert.progress) {
      throw new BadRequestException('关联进展不存在');
    }

    const updated = await this.promoteProgressStatus({
      progress: alert.progress,
      nextStatus: targetStatus,
      note: payload.note || `通过动作 token 确认到 ${targetStatus}`,
      sourceType: 'confirm_token',
      sourceEventId: payload.eventId || alert.eventId || undefined,
      idempotencyKey: this.hashParts([alert.id, normalizedToken, targetStatus]),
      evidence: {
        actionToken: normalizedToken,
        actionType: alert.actionType,
        payload,
      },
    });

    await this.prisma.progressAlert.update({
      where: { id: alert.id },
      data: {
        status: 'handled',
        handledAt: new Date(),
      },
    });

    return {
      consumed: true,
      progressId: updated.id,
      targetStatus,
      currentStatus: updated.status,
    };
  }

  async createChangeEvent(dto: CreateProgressEventDto) {
    const camp = await this.prisma.campInfo.findUnique({
      where: { id: dto.campId },
      select: {
        id: true,
        title: true,
        universityId: true,
        majorId: true,
        major: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!camp) {
      throw new NotFoundException('夏令营不存在');
    }

    const confidence = this.resolveConfidence(dto);
    const eventIdempotencyKey = this.limitKey(
      dto.idempotencyKey || this.computeEventIdempotencyKey(dto),
    );
    const existingEvent = await this.prisma.progressChangeEvent.findUnique({
      where: { idempotencyKey: eventIdempotencyKey },
    });

    const event = existingEvent || await this.prisma.progressChangeEvent.create({
      data: {
        campId: dto.campId,
        eventType: dto.eventType,
        fieldName: dto.fieldName,
        oldValue: dto.oldValue,
        newValue: dto.newValue,
        idempotencyKey: eventIdempotencyKey,
        sourceType: dto.sourceType || 'crawler',
        sourceUrl: dto.sourceUrl,
        sourceUpdatedAt: dto.sourceUpdatedAt ? new Date(dto.sourceUpdatedAt) : null,
        confidenceLabel: confidence.label,
        confidenceScore: confidence.score,
      },
    });

    const [progresses, watchSubscriptions, watchSubscriptionsAll, reminders] = await Promise.all([
      this.prisma.applicationProgress.findMany({
        where: { campId: dto.campId },
        include: { subscription: true },
      }),
      this.prisma.campWatchSubscription.findMany({
        where: { campId: dto.campId, enabled: true },
      }),
      this.prisma.campWatchSubscription.findMany({
        where: { campId: dto.campId },
        select: {
          userId: true,
          enabled: true,
          sourceType: true,
        },
      }),
      this.prisma.reminder.findMany({
        where: {
          campId: dto.campId,
          status: { in: ['pending', 'sent', 'failed'] },
        },
        select: {
          userId: true,
          campId: true,
        },
      }),
    ]);

    const disabledWatchUsers = new Set(
      watchSubscriptionsAll
        .filter((item) => item.enabled === false)
        .map((item) => item.userId),
    );

    const progressMapByUser = new Map<string, any>();
    progresses.forEach((item) => {
      if (!progressMapByUser.has(item.userId)) {
        progressMapByUser.set(item.userId, item);
      }
    });

    const recipientMap = new Map<string, {
      userId: string;
      progressId?: string;
      campId: string;
      sourceType: string;
      deadlineChanged: boolean;
      materialsChanged: boolean;
      admissionResultChanged: boolean;
      outstandingResultChanged: boolean;
      inAppEnabled: boolean;
      wechatEnabled: boolean;
      enabled: boolean;
    }>();

    watchSubscriptions.forEach((item) => {
      recipientMap.set(item.userId, {
        userId: item.userId,
        progressId: progressMapByUser.get(item.userId)?.id || undefined,
        campId: item.campId,
        sourceType: item.sourceType || 'manual',
        deadlineChanged: item.deadlineChanged,
        materialsChanged: item.materialsChanged,
        admissionResultChanged: item.admissionResultChanged,
        outstandingResultChanged: item.outstandingResultChanged,
        inAppEnabled: item.inAppEnabled,
        wechatEnabled: item.wechatEnabled,
        enabled: item.enabled,
      });
    });

    progresses.forEach((item) => {
      if (recipientMap.has(item.userId)) {
        return;
      }
      const sub = item.subscription;
      recipientMap.set(item.userId, {
        userId: item.userId,
        progressId: item.id,
        campId: item.campId,
        sourceType: 'progress',
        deadlineChanged: sub?.deadlineChanged ?? true,
        materialsChanged: sub?.materialsChanged ?? true,
        admissionResultChanged: sub?.admissionResultChanged ?? true,
        outstandingResultChanged: sub?.outstandingResultChanged ?? true,
        inAppEnabled: true,
        wechatEnabled: false,
        enabled: sub?.enabled ?? true,
      });
    });

    reminders.forEach((item) => {
      if (recipientMap.has(item.userId)) {
        return;
      }
      recipientMap.set(item.userId, {
        userId: item.userId,
        progressId: progressMapByUser.get(item.userId)?.id || undefined,
        campId: item.campId,
        sourceType: 'reminder',
        deadlineChanged: true,
        materialsChanged: true,
        admissionResultChanged: true,
        outstandingResultChanged: true,
        inAppEnabled: true,
        wechatEnabled: true,
        enabled: true,
      });
    });

    if (camp.universityId) {
      const selectionCandidates = await this.prisma.userSelection.findMany({
        where: {
          universityIds: {
            contains: `"${camp.universityId}"`,
          },
        },
        select: {
          userId: true,
          universityIds: true,
        },
      });

      selectionCandidates.forEach((item) => {
        if (recipientMap.has(item.userId)) {
          return;
        }
        if (disabledWatchUsers.has(item.userId)) {
          return;
        }
        const universityIds = this.parseUniversityIds(item.universityIds);
        if (!universityIds.includes(camp.universityId)) {
          return;
        }
        recipientMap.set(item.userId, {
          userId: item.userId,
          progressId: progressMapByUser.get(item.userId)?.id || undefined,
          campId: dto.campId,
          sourceType: 'school_default',
          deadlineChanged: true,
          materialsChanged: true,
          admissionResultChanged: true,
          outstandingResultChanged: true,
          inAppEnabled: true,
          wechatEnabled: true,
          enabled: true,
        });
      });
    }

    const userConstraintMap = await this.buildUserMajorConstraintMap(Array.from(recipientMap.keys()));
    const recipients = Array.from(recipientMap.values()).filter((item) =>
      this.shouldNotifyByUnifiedSubscription(dto.eventType, item) &&
      this.isSchoolDefaultRecipientProfessionMatched(
        item,
        {
          majorId: camp.majorId,
          majorName: camp.major?.name || '',
          title: camp.title,
        },
        userConstraintMap,
      ),
    );
    const title = this.buildEventAlertTitle(dto.eventType);
    const content = this.buildEventAlertContent(camp.title, dto);
    const priority = this.mapEventPriority(dto.eventType);

    const isResultEvent = dto.eventType === 'admission_result' || dto.eventType === 'outstanding_result';
    if (!isResultEvent) {
      for (const recipient of recipients) {
        if (recipient.inAppEnabled) {
          await this.createAlertIfAbsent({
            userId: recipient.userId,
            progressId: recipient.progressId,
            campId: recipient.campId,
            eventId: event.id,
            type: 'change_event',
            title,
            content,
            priority,
            confidenceLabel: confidence.label,
            channel: 'in_app',
            sendStatus: 'sent',
          });
        }

        if (this.shouldSendWechatByLayer(dto.eventType, recipient)) {
          await this.createWechatAlertWithSchoolMerge({
            userId: recipient.userId,
            progressId: recipient.progressId,
            campId: recipient.campId,
            eventId: event.id,
            type: 'change_event',
            title,
            content,
            priority,
            confidenceLabel: confidence.label,
            eventType: dto.eventType,
            sourceType: recipient.sourceType,
            universityId: camp.universityId,
          });
        }
      }

      return {
        event,
        notifiedUsers: recipients.length,
        confidence,
      };
    }

    const parsedEntries = this.extractResultEntries(
      dto.sourceSnippet || dto.newValue || dto.oldValue || '',
    );
    await this.persistResultEntries(event.id, dto.campId, dto.eventType, parsedEntries);

    const decisionSummary = await this.processResultEventForRecipients({
      event,
      camp,
      recipients,
      dto,
      confidenceLabel: confidence.label,
      defaultTitle: title,
      defaultContent: content,
      priority,
      parsedEntries,
    });

    return {
      event,
      confidence,
      parsedEntryCount: parsedEntries.length,
      ...decisionSummary,
    };
  }

  private async processResultEventForRecipients(params: {
    event: any;
    camp: {
      id: string;
      title: string;
      universityId?: string | null;
      majorId?: string | null;
      major?: { name?: string | null } | null;
    };
    recipients: Array<{
      userId: string;
      progressId?: string;
      campId: string;
      sourceType: string;
      inAppEnabled: boolean;
      wechatEnabled: boolean;
      enabled: boolean;
      deadlineChanged: boolean;
      materialsChanged: boolean;
      admissionResultChanged: boolean;
      outstandingResultChanged: boolean;
    }>;
    dto: CreateProgressEventDto;
    confidenceLabel: 'high' | 'medium' | 'low';
    defaultTitle: string;
    defaultContent: string;
    priority: string;
    parsedEntries: ResultEntryCandidate[];
  }) {
    const {
      event,
      camp,
      recipients,
      dto,
      confidenceLabel,
      defaultTitle,
      defaultContent,
      priority,
      parsedEntries,
    } = params;

    const progressIds = Array.from(
      new Set(
        recipients
          .map((item) => String(item.progressId || '').trim())
          .filter(Boolean),
      ),
    );
    const userIds = Array.from(new Set(recipients.map((item) => item.userId)));
    const [progressRecords, profiles] = await Promise.all([
      progressIds.length
        ? this.prisma.applicationProgress.findMany({
            where: { id: { in: progressIds } },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.userProfile.findMany({
            where: { userId: { in: userIds } },
            select: {
              userId: true,
              schoolName: true,
              major: true,
              preferredDirection: true,
              gradeRankText: true,
              englishScore: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const progressById = new Map(progressRecords.map((item) => [item.id, item]));
    const profileByUser = new Map(profiles.map((item) => [item.userId, item]));
    let autoPromotedUsers = 0;
    let confirmRequiredUsers = 0;
    let notifyOnlyUsers = 0;
    let notifiedUsers = 0;

    for (const recipient of recipients) {
      const progress = recipient.progressId ? progressById.get(recipient.progressId) : null;
      const profile = profileByUser.get(recipient.userId);

      if (!this.isAutoMatchEnabled() || !progress || parsedEntries.length === 0) {
        await this.dispatchBasicResultAlert({
          recipient,
          event,
          dto,
          title: defaultTitle,
          content: defaultContent,
          priority,
          confidenceLabel,
          universityId: camp.universityId || undefined,
        });
        notifyOnlyUsers += 1;
        notifiedUsers += 1;
        continue;
      }

      const match = this.scoreProfileAgainstResultEntries(profile, parsedEntries, camp.title);
      await this.prisma.progressMatchCandidate.upsert({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: recipient.userId,
          },
        },
        create: {
          eventId: event.id,
          userId: recipient.userId,
          progressId: progress.id,
          matchConfidenceScore: match.score,
          matchConfidenceLabel: match.label,
          featuresJson: this.safeStringify(match.features),
          decision: match.label === 'high'
            ? (this.isAutoProgressHighConfEnabled() ? 'auto_promoted' : 'confirm_required')
            : match.label === 'medium'
              ? 'confirm_required'
              : 'notify_only',
          decidedAt: new Date(),
        },
        update: {
          progressId: progress.id,
          matchConfidenceScore: match.score,
          matchConfidenceLabel: match.label,
          featuresJson: this.safeStringify(match.features),
          decision: match.label === 'high'
            ? (this.isAutoProgressHighConfEnabled() ? 'auto_promoted' : 'confirm_required')
            : match.label === 'medium'
              ? 'confirm_required'
              : 'notify_only',
          decidedAt: new Date(),
        },
      });

      const targetStatus = this.mapResultEventToStatus(dto.eventType);
      if (!targetStatus) {
        await this.dispatchBasicResultAlert({
          recipient,
          event,
          dto,
          title: defaultTitle,
          content: defaultContent,
          priority,
          confidenceLabel,
          universityId: camp.universityId || undefined,
        });
        notifyOnlyUsers += 1;
        notifiedUsers += 1;
        continue;
      }

      if (match.label === 'high' && this.isAutoProgressHighConfEnabled()) {
        const promoted = await this.tryPromoteByResultMatch({
          progress,
          targetStatus,
          eventId: event.id,
          match,
        });

        if (promoted) {
          autoPromotedUsers += 1;
          notifiedUsers += 1;
          const autoTitle = dto.eventType === 'admission_result'
            ? '已自动更新为已入营'
            : '已自动更新为结果已发布';
          const autoContent = `系统基于名单匹配（${match.label} / ${(match.score * 100).toFixed(0)}%）自动更新进展。`;
          if (recipient.inAppEnabled) {
            await this.createAlertIfAbsent({
              userId: recipient.userId,
              progressId: progress.id,
              campId: recipient.campId,
              eventId: event.id,
              type: 'result_watch',
              title: autoTitle,
              content: autoContent,
              priority: 'high',
              confidenceLabel: match.label,
              channel: 'in_app',
              sendStatus: 'sent',
            });
          }
          if (this.shouldSendWechatByLayer(dto.eventType, recipient)) {
            await this.createWechatAlertWithSchoolMerge({
              userId: recipient.userId,
              progressId: progress.id,
              campId: recipient.campId,
              eventId: event.id,
              type: 'result_watch',
              title: autoTitle,
              content: autoContent,
              priority: 'high',
              confidenceLabel: match.label,
              eventType: dto.eventType,
              sourceType: recipient.sourceType,
              universityId: camp.universityId || undefined,
            });
          }
          continue;
        }
      }

      if (match.score >= MATCH_CONFIRM_THRESHOLD) {
        const inAppActionToken = this.generateActionToken();
        const actionExpireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const actionPayload = {
          progressId: progress.id,
          targetStatus,
          eventId: event.id,
          eventType: dto.eventType,
          note: `名单匹配确认：${dto.eventType}`,
          match,
        };
        const confirmTitle = dto.eventType === 'admission_result'
          ? '检测到可能入营，请确认'
          : '检测到结果发布，请确认';
        const confirmContent = `匹配置信度 ${(match.score * 100).toFixed(0)}%，点击“立即确认”可一键更新进展。`;

        if (recipient.inAppEnabled) {
          await this.createActionAlert({
            userId: recipient.userId,
            progressId: progress.id,
            campId: recipient.campId,
            eventId: event.id,
            channel: 'in_app',
            sendStatus: 'sent',
            title: confirmTitle,
            content: confirmContent,
            priority: 'high',
            confidenceLabel: match.label,
            actionType: 'confirm_progress_step',
            actionToken: inAppActionToken,
            actionPayloadJson: this.safeStringify(actionPayload),
            actionExpireAt,
          });
        }
        if (this.shouldSendWechatByLayer(dto.eventType, recipient)) {
          const wechatActionToken = this.isWechatActionTokenEnabled()
            ? this.generateActionToken()
            : undefined;
          await this.createActionAlert({
            userId: recipient.userId,
            progressId: progress.id,
            campId: recipient.campId,
            eventId: event.id,
            channel: 'wechat',
            sendStatus: 'pending',
            title: confirmTitle,
            content: confirmContent,
            priority: 'high',
            confidenceLabel: match.label,
            actionType: wechatActionToken ? 'confirm_progress_step' : undefined,
            actionToken: wechatActionToken,
            actionPayloadJson: wechatActionToken ? this.safeStringify(actionPayload) : undefined,
            actionExpireAt: wechatActionToken ? actionExpireAt : undefined,
          });
        }

        confirmRequiredUsers += 1;
        notifiedUsers += 1;
        continue;
      }

      await this.dispatchBasicResultAlert({
        recipient,
        event,
        dto,
        title: defaultTitle,
        content: defaultContent,
        priority,
        confidenceLabel,
        universityId: camp.universityId || undefined,
      });
      notifyOnlyUsers += 1;
      notifiedUsers += 1;
    }

    return {
      notifiedUsers,
      autoPromotedUsers,
      confirmRequiredUsers,
      notifyOnlyUsers,
    };
  }

  private async dispatchBasicResultAlert(params: {
    recipient: {
      userId: string;
      progressId?: string;
      campId: string;
      sourceType?: string;
      inAppEnabled: boolean;
      wechatEnabled: boolean;
    };
    event: any;
    dto: CreateProgressEventDto;
    title: string;
    content: string;
    priority: string;
    confidenceLabel: 'high' | 'medium' | 'low';
    universityId?: string;
  }) {
    const { recipient, event, dto, title, content, priority, confidenceLabel, universityId } = params;
    if (recipient.inAppEnabled) {
      await this.createAlertIfAbsent({
        userId: recipient.userId,
        progressId: recipient.progressId,
        campId: recipient.campId,
        eventId: event.id,
        type: 'change_event',
        title,
        content,
        priority,
        confidenceLabel,
        channel: 'in_app',
        sendStatus: 'sent',
      });
    }
    if (this.shouldSendWechatByLayer(dto.eventType, recipient)) {
      await this.createWechatAlertWithSchoolMerge({
        userId: recipient.userId,
        progressId: recipient.progressId,
        campId: recipient.campId,
        eventId: event.id,
        type: 'change_event',
        title,
        content,
        priority,
        confidenceLabel,
        eventType: dto.eventType,
        sourceType: recipient.sourceType,
        universityId,
      });
    }
  }

  private async tryPromoteByResultMatch(params: {
    progress: any;
    targetStatus: ProgressStatus;
    eventId: string;
    match: {
      label: 'high' | 'medium' | 'low';
      score: number;
      features: Record<string, any>;
    };
  }) {
    const { progress, targetStatus, eventId, match } = params;
    if (progress.status === targetStatus) {
      return true;
    }

    const allowed = STATUS_TRANSITIONS[progress.status as ProgressStatus] || [];
    if (!allowed.includes(targetStatus)) {
      return false;
    }

    const updated = await this.promoteProgressStatus({
      progress,
      nextStatus: targetStatus,
      note: `自动推进：${eventId}`,
      sourceType: 'auto_high_conf',
      sourceEventId: eventId,
      idempotencyKey: this.hashParts([progress.id, targetStatus, eventId, 'auto_high_conf']),
      evidence: {
        score: match.score,
        label: match.label,
        features: match.features,
      },
    });
    return Boolean(updated);
  }

  private async promoteProgressStatus(params: {
    progress: any;
    nextStatus: ProgressStatus;
    note?: string;
    sourceType: string;
    sourceEventId?: string;
    idempotencyKey: string;
    evidence?: Record<string, any>;
  }) {
    const { progress, nextStatus, note, sourceType, sourceEventId, idempotencyKey, evidence } = params;
    const normalizedIdempotencyKey = this.limitKey(idempotencyKey);
    const existingLog = await this.prisma.progressStatusLog.findUnique({
      where: { idempotencyKey: normalizedIdempotencyKey },
      include: {
        progress: true,
      },
    });
    if (existingLog?.progress) {
      return existingLog.progress;
    }

    const current = await this.prisma.applicationProgress.findUnique({
      where: { id: progress.id },
    });
    if (!current) {
      throw new NotFoundException('申请进展不存在');
    }
    if (current.status === nextStatus) {
      return current;
    }

    this.validateStatusTransition(current.status as ProgressStatus, nextStatus);

    const now = new Date();
    const data: any = {
      status: nextStatus,
      statusNote: note ?? current.statusNote,
      lastStatusAt: now,
    };
    if (nextStatus === 'submitted' && !current.submittedAt) {
      data.submittedAt = now;
    }
    if (nextStatus === 'admitted' && !current.admittedAt) {
      data.admittedAt = now;
    }
    if (nextStatus === 'outstanding_published' && !current.outstandingPublishedAt) {
      data.outstandingPublishedAt = now;
    }

    const updated = await this.prisma.applicationProgress.update({
      where: { id: current.id },
      data,
    });
    await this.createStatusLog({
      progressId: current.id,
      fromStatus: current.status,
      toStatus: nextStatus,
      note,
      sourceType,
      sourceEventId,
      idempotencyKey: normalizedIdempotencyKey,
      evidence,
    });
    await this.createResultWatchAlert(current.id, current.userId, nextStatus);
    return updated;
  }

  private async createStatusLog(params: {
    progressId: string;
    fromStatus?: string | null;
    toStatus: string;
    note?: string;
    sourceType: string;
    sourceEventId?: string;
    idempotencyKey?: string;
    evidence?: Record<string, any>;
  }) {
    const idempotencyKey = params.idempotencyKey ? this.limitKey(params.idempotencyKey) : undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.progressStatusLog.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        return existing;
      }
    }
    return this.prisma.progressStatusLog.create({
      data: {
        progressId: params.progressId,
        fromStatus: params.fromStatus || null,
        toStatus: params.toStatus,
        note: params.note,
        sourceType: params.sourceType || 'manual',
        sourceEventId: params.sourceEventId,
        idempotencyKey,
        evidenceJson: params.evidence ? this.safeStringify(params.evidence) : null,
      },
    });
  }

  private mapResultEventToStatus(eventType: string): ProgressStatus | null {
    if (eventType === 'admission_result') {
      return 'admitted';
    }
    if (eventType === 'outstanding_result') {
      return 'outstanding_published';
    }
    return null;
  }

  private scoreProfileAgainstResultEntries(
    profile: any,
    entries: ResultEntryCandidate[],
    campTitle: string,
  ): {
    label: 'high' | 'medium' | 'low';
    score: number;
    features: Record<string, any>;
  } {
    if (!profile) {
      return {
        label: 'low',
        score: 0.3,
        features: {
          reason: 'profile_missing',
        },
      };
    }

    const profileSchool = this.normalizeKeywordText(profile.schoolName);
    const profileMajor = this.normalizeKeywordText(profile.major || profile.preferredDirection);
    if (!profileSchool && !profileMajor) {
      return {
        label: 'low',
        score: 0.35,
        features: {
          reason: 'profile_key_fields_missing',
        },
      };
    }

    let best: any = {
      score: 0.2,
      schoolScore: 0,
      majorScore: 0,
      auxScore: 0,
      entry: null,
    };

    entries.forEach((entry) => {
      const schoolScore = this.calcKeywordSimilarity(profileSchool, entry.schoolRaw);
      const majorScore = this.calcKeywordSimilarity(profileMajor, entry.majorRaw || entry.sourceSnippet || campTitle);
      const auxScore = this.calcAuxSimilarity(profile, entry);
      const score = Number(Math.min(1, 0.2 + schoolScore * 0.5 + majorScore * 0.25 + auxScore * 0.15).toFixed(2));
      if (score > best.score) {
        best = {
          score,
          schoolScore,
          majorScore,
          auxScore,
          entry,
        };
      }
    });

    const label = best.score >= MATCH_AUTO_THRESHOLD
      ? 'high'
      : best.score >= MATCH_CONFIRM_THRESHOLD
        ? 'medium'
        : 'low';

    return {
      label,
      score: best.score,
      features: {
        profile: {
          schoolName: profile.schoolName || '',
          major: profile.major || '',
        },
        bestEntry: best.entry
          ? {
              nameRaw: best.entry.nameRaw || '',
              schoolRaw: best.entry.schoolRaw || '',
              majorRaw: best.entry.majorRaw || '',
            }
          : null,
        breakdown: {
          school: Number(best.schoolScore.toFixed(2)),
          major: Number(best.majorScore.toFixed(2)),
          aux: Number(best.auxScore.toFixed(2)),
        },
      },
    };
  }

  private calcKeywordSimilarity(profileText: string, entryText?: string): number {
    if (!profileText || !entryText) return 0;
    const normalizedEntry = this.normalizeKeywordText(entryText);
    if (!normalizedEntry) return 0;
    if (normalizedEntry.includes(profileText) || profileText.includes(normalizedEntry)) {
      return 1;
    }
    const profileTokens = profileText.split(/\s+/).filter(Boolean);
    const entryTokens = normalizedEntry.split(/\s+/).filter(Boolean);
    if (profileTokens.length === 0 || entryTokens.length === 0) {
      return 0;
    }
    const hits = profileTokens.filter((token) =>
      token.length > 1 && entryTokens.some((entryToken) => entryToken.includes(token)),
    ).length;
    return Math.max(0, Math.min(1, hits / profileTokens.length));
  }

  private calcAuxSimilarity(profile: any, entry: ResultEntryCandidate): number {
    const gradeRank = this.normalizeKeywordText(profile.gradeRankText || '');
    const snippet = this.normalizeKeywordText(entry.sourceSnippet || '');
    if (!gradeRank || !snippet) {
      return 0;
    }
    return snippet.includes(gradeRank) ? 1 : 0;
  }

  private normalizeKeywordText(value?: string) {
    if (!value) return '';
    return String(value).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, ' ').trim();
  }

  private extractResultEntries(rawText: string): ResultEntryCandidate[] {
    const normalized = String(rawText || '').trim();
    if (!normalized) return [];

    const fromStructured = this.extractResultEntriesFromStructured(normalized);
    if (fromStructured.length > 0) {
      return fromStructured.slice(0, 200);
    }

    const lines = normalized
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const dedup = new Set<string>();
    const entries: ResultEntryCandidate[] = [];

    lines.forEach((line) => {
      const candidate = this.extractResultEntryFromLine(line);
      if (!candidate) return;
      const key = `${candidate.nameRaw}|${candidate.schoolRaw || ''}|${candidate.majorRaw || ''}`;
      if (dedup.has(key)) return;
      dedup.add(key);
      entries.push(candidate);
    });

    return entries.slice(0, 200);
  }

  private extractResultEntriesFromStructured(rawText: string): ResultEntryCandidate[] {
    if (!(rawText.startsWith('{') || rawText.startsWith('['))) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawText);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      const entries: ResultEntryCandidate[] = [];
      const dedup = new Set<string>();
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }
        if (typeof current !== 'object') {
          continue;
        }
        Object.keys(current).forEach((key) => {
          const value = (current as any)[key];
          if (Array.isArray(value) || (value && typeof value === 'object')) {
            queue.push(value);
          }
        });
        const mapped = this.mapStructuredToResultEntry(current as Record<string, any>);
        if (!mapped) continue;
        const key = `${mapped.nameRaw}|${mapped.schoolRaw || ''}|${mapped.majorRaw || ''}`;
        if (dedup.has(key)) continue;
        dedup.add(key);
        entries.push(mapped);
      }
      return entries;
    } catch (error) {
      return [];
    }
  }

  private mapStructuredToResultEntry(row: Record<string, any>): ResultEntryCandidate | null {
    const name = this.pickFirstText(row, ['name', '姓名', 'studentName', '候选人']);
    if (!this.isReasonableName(name)) {
      return null;
    }
    const school = this.pickFirstText(row, ['school', '本科院校', 'university', '学校']);
    const major = this.pickFirstText(row, ['major', '专业', '学院', 'department']);
    return {
      nameRaw: name,
      schoolRaw: school || '',
      majorRaw: major || '',
      aux: row,
      sourceSnippet: this.limitText(this.safeStringify(row), 300),
    };
  }

  private extractResultEntryFromLine(line: string): ResultEntryCandidate | null {
    const cleanLine = line.replace(/^\d+\s*[.、]\s*/, '');
    if (!cleanLine) return null;

    const tokens = cleanLine
      .split(/[\s,，、|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (tokens.length === 0) return null;

    const nameToken = tokens.find((token) => this.isReasonableName(token)) || '';
    if (!nameToken) return null;
    const schoolToken = tokens.find((token) => /大学|学院|学校|university/i.test(token)) || '';
    const majorToken = tokens.find((token) => /专业|工程|科学|技术|计算机|电子|数学|物理|化学/i.test(token)) || '';
    return {
      nameRaw: nameToken,
      schoolRaw: schoolToken,
      majorRaw: majorToken,
      sourceSnippet: this.limitText(cleanLine, 200),
    };
  }

  private isReasonableName(value?: string): boolean {
    const name = String(value || '').trim();
    if (!name) return false;
    if (/名单|公示|结果|通知|优秀营员|入营|序号|姓名/i.test(name)) return false;
    if (/^[\u4e00-\u9fa5]{2,6}[*xX]?$/.test(name)) return true;
    if (/^[a-zA-Z][a-zA-Z\s]{1,30}$/.test(name)) return true;
    return false;
  }

  private pickFirstText(row: Record<string, any>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '';
  }

  private async persistResultEntries(
    eventId: string,
    campId: string,
    eventType: ProgressEventType,
    entries: ResultEntryCandidate[],
  ) {
    await this.prisma.campResultEntry.deleteMany({
      where: { eventId },
    });
    if (!entries.length) {
      return 0;
    }

    const entryType = eventType === 'admission_result' ? 'admission' : 'outstanding';
    await this.prisma.campResultEntry.createMany({
      data: entries.map((item) => ({
        campId,
        eventId,
        entryType,
        nameRaw: item.nameRaw,
        nameHash: this.hashParts([this.normalizeKeywordText(item.nameRaw)]),
        schoolRaw: item.schoolRaw || null,
        majorRaw: item.majorRaw || null,
        auxJson: item.aux ? this.safeStringify(item.aux) : null,
        sourceSnippet: item.sourceSnippet || null,
      })),
    });
    return entries.length;
  }

  private generateActionToken() {
    return randomBytes(24).toString('hex');
  }

  private async createActionAlert(params: {
    userId: string;
    progressId?: string;
    campId?: string;
    eventId?: string;
    type?: string;
    title: string;
    content: string;
    priority: string;
    confidenceLabel?: string;
    channel: 'in_app' | 'wechat';
    sendStatus: 'pending' | 'sending' | 'sent' | 'failed';
    actionType?: string;
    actionToken?: string;
    actionPayloadJson?: string;
    actionExpireAt?: Date;
  }) {
    const idempotencyKey = this.computeAlertIdempotencyKey(
      params.userId,
      params.eventId || '',
      `${params.channel}|${params.actionType || 'plain'}`,
    );
    const existing = await this.prisma.progressAlert.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.progressAlert.create({
      data: {
        userId: params.userId,
        progressId: params.progressId || null,
        campId: params.campId || null,
        eventId: params.eventId || null,
        type: params.type || 'change_event',
        title: params.title,
        content: params.content,
        priority: params.priority,
        confidenceLabel: params.confidenceLabel,
        channel: params.channel,
        sendStatus: params.sendStatus,
        idempotencyKey,
        status: 'pending',
        actionType: params.actionType || null,
        actionToken: params.actionToken || null,
        actionPayloadJson: params.actionPayloadJson || null,
        actionExpireAt: params.actionExpireAt || null,
        scheduledAt: new Date(),
      },
    });
  }

  private normalizeConfirmableStatus(value?: string): ProgressStatus | null {
    const normalized = String(value || '').trim() as ProgressStatus;
    if (normalized === 'submitted' || normalized === 'admitted' || normalized === 'outstanding_published') {
      return normalized;
    }
    return null;
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

  private shouldNotifyByUnifiedSubscription(
    eventType: ProgressEventType,
    subscription: {
      enabled: boolean;
      deadlineChanged: boolean;
      materialsChanged: boolean;
      admissionResultChanged: boolean;
      outstandingResultChanged: boolean;
    } | null,
  ) {
    return this.shouldNotifyBySubscription(eventType, subscription);
  }

  private async createAlertIfAbsent(params: {
    userId: string;
    progressId?: string;
    campId?: string;
    eventId?: string;
    type: string;
    title: string;
    content: string;
    priority: string;
    confidenceLabel?: string;
    channel: 'in_app' | 'wechat';
    sendStatus: 'pending' | 'sending' | 'sent' | 'failed';
  }) {
    const idempotencyKey = this.computeAlertIdempotencyKey(
      params.userId,
      params.eventId || '',
      params.channel,
    );
    const existing = await this.prisma.progressAlert.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    await this.prisma.progressAlert.create({
      data: {
        userId: params.userId,
        progressId: params.progressId || null,
        campId: params.campId || null,
        eventId: params.eventId || null,
        type: params.type,
        title: params.title,
        content: params.content,
        priority: params.priority,
        confidenceLabel: params.confidenceLabel,
        channel: params.channel,
        sendStatus: params.sendStatus,
        idempotencyKey,
        status: 'pending',
        scheduledAt: new Date(),
      },
    });
  }

  private async upsertCampWatchSubscriptionByProgress(
    userId: string,
    campId: string,
    dto?: Partial<UpdateProgressSubscriptionDto>,
  ) {
    await this.prisma.campWatchSubscription.upsert({
      where: {
        userId_campId: {
          userId,
          campId,
        },
      },
      create: {
        userId,
        campId,
        sourceType: 'progress',
        enabled: dto?.enabled ?? true,
        deadlineChanged: dto?.deadlineChanged ?? true,
        materialsChanged: dto?.materialsChanged ?? true,
        admissionResultChanged: dto?.admissionResultChanged ?? true,
        outstandingResultChanged: dto?.outstandingResultChanged ?? true,
        inAppEnabled: true,
        wechatEnabled: true,
      },
      update: {
        sourceType: 'progress',
        enabled: dto?.enabled ?? true,
        deadlineChanged: dto?.deadlineChanged ?? true,
        materialsChanged: dto?.materialsChanged ?? true,
        admissionResultChanged: dto?.admissionResultChanged ?? true,
        outstandingResultChanged: dto?.outstandingResultChanged ?? true,
        inAppEnabled: true,
      },
    });
  }

  private resolveConfidence(dto: CreateProgressEventDto): {
    label: 'high' | 'medium' | 'low';
    score: number;
  } {
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
      label: (normalizedScore >= 0.8 ? 'high' : normalizedScore >= 0.55 ? 'medium' : 'low') as
        | 'high'
        | 'medium'
        | 'low',
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

  private computeEventIdempotencyKey(dto: CreateProgressEventDto) {
    const parts = [
      dto.campId || '',
      dto.eventType || '',
      dto.fieldName || '',
      (dto.oldValue || '').trim(),
      (dto.newValue || '').trim(),
      dto.sourceUpdatedAt || '',
      dto.sourceUrl || '',
    ];
    return this.hashParts(parts);
  }

  private computeAlertIdempotencyKey(userId: string, eventId: string, channel: string) {
    return this.hashParts([userId || '', eventId || '', channel || '']);
  }

  private safeParseJson(value?: string | null) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  private safeStringify(value: any) {
    if (value === null || value === undefined) {
      return '';
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '';
    }
  }

  private limitText(value?: string | null, maxLength: number = 500) {
    const raw = String(value || '');
    if (!raw) return '';
    return raw.length <= maxLength ? raw : `${raw.slice(0, maxLength - 3)}...`;
  }

  private hashParts(parts: string[]) {
    const content = parts.join('|');
    return createHash('sha256').update(content).digest('hex').slice(0, 80);
  }

  private limitKey(key: string) {
    if (!key) {
      return this.hashParts([String(Date.now())]);
    }
    return key.length <= 80 ? key : key.slice(0, 80);
  }
}
