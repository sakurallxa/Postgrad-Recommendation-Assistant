/**
 * 抓取完成后的 AI 匹配调度器。
 *
 * 输入：(department_id, [campIds])
 * 行为：找该 department 的所有 active 订阅用户，对每个 (user, camp) 调 LLM 跑匹配，写入 CampMatchResult。
 *
 * 设计选择（生产用）：
 * - 串行 + 限速：避免 LLM API 限流（DeepSeek 默认 60 req/min）
 * - 失败重试：单条匹配失败不影响其他
 * - 高匹配 (>70) 触发 1 分钟后的提醒，让用户当天看到
 */
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

let _singleton: MatchScheduler | null = null;

export function MatchSchedulerSingleton(
  prisma: PrismaService,
  config: ConfigService,
  logger: Logger,
): MatchScheduler {
  if (!_singleton) {
    _singleton = new MatchScheduler(prisma, config, logger);
  }
  return _singleton;
}

class MatchScheduler {
  private readonly logger: Logger;
  private readonly prisma: PrismaService;
  private readonly config: ConfigService;
  private llmService: any = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(prisma: PrismaService, config: ConfigService, logger: Logger) {
    this.prisma = prisma;
    this.config = config;
    this.logger = logger;
  }

  /**
   * 把 (deptId, campIds) 的匹配任务挂到串行队列。
   * 立即返回，实际匹配在后台进行。
   */
  async scheduleMatching(deptId: string, campIds: string[]): Promise<void> {
    if (!campIds || campIds.length === 0) return;
    this.queue = this.queue
      .then(() => this.runOne(deptId, campIds))
      .catch((e) => this.logger.error(`[match] 调度失败: ${e?.message}`));
  }

  /**
   * 全校层级公告匹配（"全校类"等没有归属到具体院系的 camp）。
   * 给"该大学下任意 dept 的所有订阅用户"都跑一次 LLM 匹配。
   * 数据形态：camp.departmentId IS NULL but camp.universityId IS SET
   */
  /**
   * 单用户重新匹配：用于 profile 更新后刷新该用户的所有 CampMatchResult。
   * 只针对一个 userId 跑 LLM，不影响其他用户。
   */
  async scheduleMatchingForUser(userId: string, campIds: string[]): Promise<void> {
    if (!campIds || campIds.length === 0 || !userId) return;
    this.queue = this.queue
      .then(() => this.runOneForUser(userId, campIds))
      .catch((e) => this.logger.error(`[match-user] 调度失败: ${e?.message}`));
  }

  private async runOneForUser(userId: string, campIds: string[]): Promise<void> {
    const camps = await this.prisma.campInfo.findMany({
      where: { id: { in: campIds } },
      include: { university: { select: { name: true } } },
    });
    this.logger.log(`[match-user] user=${userId.slice(0, 8)} × ${camps.length} camps`);
    for (const camp of camps) {
      // 已有就跳过（runOneForUser 仅创建新 match；profile 刷新流程已先 delete 老的）
      const exists = await this.prisma.campMatchResult.findUnique({
        where: { userId_campId: { userId, campId: camp.id } },
      });
      if (exists) continue;
      try {
        await this.matchOne(userId, camp);
      } catch (e: any) {
        this.logger.warn(`[match-user] 单条失败 user=${userId} camp=${camp.id}: ${e?.message}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  async scheduleMatchingForUniversity(universityId: string, campIds: string[]): Promise<void> {
    if (!campIds || campIds.length === 0 || !universityId) return;
    this.queue = this.queue
      .then(() => this.runOneForUniversity(universityId, campIds))
      .catch((e) => this.logger.error(`[match-uni] 调度失败: ${e?.message}`));
  }

  private async runOneForUniversity(universityId: string, campIds: string[]): Promise<void> {
    // 拉该 university 下所有 active dept 的订阅用户（去重）
    const depts = await this.prisma.department.findMany({
      where: { universityId, active: true },
      select: { id: true },
    });
    const deptIds = depts.map((d) => d.id);
    if (deptIds.length === 0) {
      this.logger.log(`[match-uni] university ${universityId} 无活跃 dept，跳过`);
      return;
    }
    const subs = await this.prisma.userDepartmentSubscription.findMany({
      where: { departmentId: { in: deptIds }, active: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    if (subs.length === 0) {
      this.logger.log(`[match-uni] university ${universityId} 无订阅用户，跳过`);
      return;
    }

    const camps = await this.prisma.campInfo.findMany({
      where: { id: { in: campIds } },
      include: { university: { select: { name: true } } },
    });

    this.logger.log(
      `[match-uni] 处理 univ=${universityId}: ${subs.length} 用户 × ${camps.length} 全校公告 = ${subs.length * camps.length} 次匹配`,
    );

    for (const camp of camps) {
      for (const sub of subs) {
        const exists = await this.prisma.campMatchResult.findUnique({
          where: { userId_campId: { userId: sub.userId, campId: camp.id } },
        });
        if (exists) continue;
        try {
          await this.matchOne(sub.userId, camp);
        } catch (e: any) {
          this.logger.warn(`[match-uni] 单条失败 user=${sub.userId} camp=${camp.id}: ${e?.message}`);
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  private async runOne(deptId: string, campIds: string[]): Promise<void> {
    const subs = await this.prisma.userDepartmentSubscription.findMany({
      where: { departmentId: deptId, active: true },
      select: { userId: true },
    });
    if (subs.length === 0) {
      this.logger.log(`[match] dept ${deptId} 无订阅用户，跳过`);
      return;
    }

    const camps = await this.prisma.campInfo.findMany({
      where: { id: { in: campIds } },
      include: { university: { select: { name: true } } },
    });

    this.logger.log(
      `[match] 处理 dept=${deptId}: ${subs.length} 用户 × ${camps.length} 公告 = ${subs.length * camps.length} 次匹配`,
    );

    for (const camp of camps) {
      for (const sub of subs) {
        // 跳过已存在的 (userId, campId) 匹配
        const exists = await this.prisma.campMatchResult.findUnique({
          where: { userId_campId: { userId: sub.userId, campId: camp.id } },
        });
        if (exists) continue;

        try {
          await this.matchOne(sub.userId, camp);
        } catch (e: any) {
          this.logger.warn(`[match] 单条失败 user=${sub.userId} camp=${camp.id}: ${e?.message}`);
        }
        // 限速：每条间隔 800ms，避免 LLM 触发限流
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  private async matchOne(userId: string, camp: any): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const profileForLlm = this.buildProfileForLlm(profile);

    const llm = this.getLlmService();
    if (!llm) {
      this.logger.warn(`[match] LLM 服务未就绪，跳过 user=${userId} camp=${camp.id}`);
      return;
    }
    const rawContent = (camp.rawContent || '').slice(0, 6000) || camp.title || '';
    const result = await llm.analyzeCampForUser(rawContent, profileForLlm, {
      sourceUrl: camp.sourceUrl,
      existingTitle: camp.title,
    });
    if (!result) {
      this.logger.warn(`[match] LLM 返回 null user=${userId} camp=${camp.id}`);
      return;
    }

    await this.prisma.campMatchResult.create({
      data: {
        userId,
        campId: camp.id,
        isRelevant: result.isRelevant,
        campType: result.campType || camp.announcementType,
        matchesUserMajor: result.matchesUserMajor,
        // deadline 字段 LLM 一直比较准，保留 fallback。
        extractedDeadline: result.extractedDeadline ? new Date(result.extractedDeadline) : camp.deadline,
        // ⚠ 营期字段（startDate/endDate）：严格以 LLM 结果为准（含 sanity check 后的 null）。
        // 不 fallback 到 camp.startDate/endDate —— 那是历史 LLM 误识别的报名期，
        // 会让 sanity check 的清空动作被反向回填。
        extractedStartDate: result.extractedStartDate ? new Date(result.extractedStartDate) : null,
        extractedEndDate: result.extractedEndDate ? new Date(result.extractedEndDate) : null,
        extractedLocation: result.extractedLocation || camp.location,
        extractedSummary: result.extractedSummary,
        keyRequirements: JSON.stringify(result.keyRequirements || []),
        overallRecommendation: result.overallRecommendation,
        matchScore: result.matchScore || null,
        reasoning: result.reasoning,
        llmModel: result.llmModel,
        llmTokensUsed: result.llmTokensUsed,
      },
    });

    // 高匹配 → 1 分钟后弹推送提醒
    if ((result.matchScore || 0) > 70) {
      try {
        await this.prisma.reminder.create({
          data: {
            userId,
            campId: camp.id,
            remindTime: new Date(Date.now() + 60 * 1000),
            status: 'pending',
          },
        });
      } catch {
        // 重复忽略
      }
    }
  }

  private getLlmService() {
    if (this.llmService) return this.llmService;
    try {
      const { LlmAssistantService } = require('../assistant/llm-assistant.service');
      this.llmService = new LlmAssistantService(this.config);
    } catch (e: any) {
      this.logger.error(`[match] 加载 LlmAssistantService 失败: ${e?.message}`);
      return null;
    }
    return this.llmService;
  }

  private buildProfileForLlm(profile: any): any {
    if (!profile) return {};
    let targetMajors: string[] = [];
    if (profile.targetMajors) {
      try {
        targetMajors = JSON.parse(profile.targetMajors);
      } catch {}
    }
    return {
      undergraduateSchool: profile.schoolName,
      undergraduateMajor: profile.major,
      gpa: profile.gpa,
      gradeRankPercent: profile.gradeRankPercent,
      gradeRankText: profile.gradeRankText,
      englishStandardized: profile.englishStandardized,
      researchExperience: profile.researchExperience,
      competitionAwards: profile.competitionAwards,
      targetMajors,
    };
  }
}
