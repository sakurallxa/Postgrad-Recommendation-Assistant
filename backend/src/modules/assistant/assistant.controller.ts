import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { LlmAssistantService, StudentProfileForLlm } from './llm-assistant.service';
import { UrlFetcherService } from './url-fetcher.service';

class SubmitUrlDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  hintTitle?: string;
}

class UpdateMatchActionDto {
  @IsString()
  // 'interested'/'skipped'/'hidden'/'reset' → 操作 userAction（互斥）
  // 'applied'/'unapplied' → 操作 isApplied（与 userAction 独立）
  @IsIn(['interested', 'applied', 'unapplied', 'skipped', 'hidden', 'reset'])
  action!: string;
}

@ApiTags('AI 助理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  private readonly logger = new Logger(AssistantController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmAssistant: LlmAssistantService,
    private readonly urlFetcher: UrlFetcherService,
  ) {}

  @Post('submit-url')
  @ApiOperation({
    summary: '提交公告 URL → 抓取 → LLM 分析 → 入库匹配结果',
    description: 'β场景核心入口：用户/系统贴 URL，AI 一次性判断是否相关 + 提取关键字段 + 与档案匹配',
  })
  async submitUrl(@Body() body: SubmitUrlDto, @CurrentUser() user: any) {
    if (!user?.sub) throw new BadRequestException('需要登录');

    // Mock 模式：开发环境 (ALLOW_MOCK_WECHAT_LOGIN=true) 跳过真实 URL 抓取 + 用 hintTitle 喂 mock LLM
    // 让"手动测试 AI 助理"在本地预览时也能跑通
    const isMockMode = process.env.ALLOW_MOCK_WECHAT_LOGIN === 'true';
    let fetched: { content: string; title: string } | null = null;

    if (isMockMode) {
      const hint = body.hintTitle || body.url;
      // 从 URL 推断学校名，拼到 raw 内容里，让 mock LLM 能"看见"
      const guessedUni = await this.resolveUniversityFromUrlAndTitle(body.url || '', hint);
      const uniHint = guessedUni?.name ? `${guessedUni.name} ` : '';
      // 从 URL/hint 里捕捉招生方向关键字
      const majorHints =
        (body.url + ' ' + hint).match(
          /计算机|人工智能|软件|电子|信息|通信|自动化|机械|能源|材料|化学|物理|生物|医学|经济|金融|管理|法学|文学|历史|哲学|教育|设计|艺术/g,
        ) || [];
      const majorClause = majorHints.length > 0 ? `面向${majorHints.join('、')}方向` : '面向理工科相关专业';

      fetched = {
        title: `${uniHint}${hint}`.slice(0, 80),
        content: `${uniHint}${hint}\n\n（mock 模式：未真实抓取 URL，以下为占位原文）\n\n一、招生方向\n本${/预推免|推免/.test(hint) ? '预推免' : '夏令营'}${majorClause}，包括但不限于上述方向。\n\n二、申请条件\n1. 国内重点高校 985/211 相关专业 2027 届本科毕业生\n2. 前三年综合排名前 30%\n3. CET-6 425+ 或 TOEFL 90+\n4. 具备较强科研兴趣，有项目/论文/竞赛优先\n\n三、申请材料\n1. 报名表 2. 成绩单 3. 个人陈述 4. 英语证明 5. 推荐信 2 封\n\n四、报名截止：2027-06-30 23:59\n\n五、营期：2027-07-15 至 2027-07-21\n\n联系方式：${body.url}`,
      };
    } else {
      // 1. 抓 URL
      fetched = await this.urlFetcher.fetch(body.url);
      if (!fetched) {
        throw new BadRequestException('URL 无法访问，请检查链接');
      }
      if (fetched.content.length < 200 || /404|找不到|page not found|页面不存在/i.test(fetched.title)) {
        throw new BadRequestException(
          `这个 URL 的内容看起来是错误页或已失效（标题: "${fetched.title || '?'}"），请贴一个真实的公告详情页链接`,
        );
      }
    }

    // 2. 加载用户档案
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.sub },
    });

    const profileForLlm = this.buildProfileForLlm(profile);

    // 3. LLM 分析
    const match = await this.llmAssistant.analyzeCampForUser(
      fetched.content,
      profileForLlm,
      { sourceUrl: body.url, existingTitle: body.hintTitle || fetched.title },
    );

    if (!match) {
      this.logger.warn(`LLM 分析返回 null，URL=${body.url}, content len=${fetched.content.length}`);
      throw new BadRequestException(
        'AI 暂时无法分析这条公告，可能原因：内容过短/格式特殊/网络抖动。请稍后重试或换条 URL',
      );
    }

    // 4. 入库
    const camp = await this.upsertCamp({
      title: match.extractedTitle || fetched.title || '未命名公告',
      sourceUrl: body.url,
      rawContent: fetched.content.slice(0, 12000),
      announcementType: match.campType || 'summer_camp',
      deadline: match.extractedDeadline,
      startDate: match.extractedStartDate,
      endDate: match.extractedEndDate,
      location: match.extractedLocation,
    });

    const matchResult = await this.prisma.campMatchResult.upsert({
      where: { userId_campId: { userId: user.sub, campId: camp.id } },
      create: {
        userId: user.sub,
        campId: camp.id,
        isRelevant: match.isRelevant,
        campType: match.campType,
        matchesUserMajor: match.matchesUserMajor,
        extractedDeadline: match.extractedDeadline ? new Date(match.extractedDeadline) : null,
        extractedStartDate: match.extractedStartDate ? new Date(match.extractedStartDate) : null,
        extractedEndDate: match.extractedEndDate ? new Date(match.extractedEndDate) : null,
        extractedLocation: match.extractedLocation,
        extractedSummary: match.extractedSummary,
        keyRequirements: JSON.stringify(match.keyRequirements),
        overallRecommendation: match.overallRecommendation,
        matchScore: match.matchScore,
        reasoning: match.reasoning,
        llmModel: match.llmModel,
        llmTokensUsed: match.llmTokensUsed,
      },
      update: {
        isRelevant: match.isRelevant,
        campType: match.campType,
        matchesUserMajor: match.matchesUserMajor,
        extractedDeadline: match.extractedDeadline ? new Date(match.extractedDeadline) : null,
        extractedStartDate: match.extractedStartDate ? new Date(match.extractedStartDate) : null,
        extractedEndDate: match.extractedEndDate ? new Date(match.extractedEndDate) : null,
        extractedLocation: match.extractedLocation,
        extractedSummary: match.extractedSummary,
        keyRequirements: JSON.stringify(match.keyRequirements),
        overallRecommendation: match.overallRecommendation,
        matchScore: match.matchScore,
        reasoning: match.reasoning,
        llmModel: match.llmModel,
        llmTokensUsed: match.llmTokensUsed,
      },
    });

    return { matchId: matchResult.id, ...this.serializeMatchResult(matchResult, camp) };
  }

  @Get('opportunities')
  @ApiOperation({ summary: '获取我的"今日新机会"列表（已被 AI 分析的匹配结果）' })
  async opportunities(
    @CurrentUser() user: any,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    if (!user?.sub) throw new BadRequestException('需要登录');
    const take = Math.min(parseInt(limit || '20', 10) || 20, 100);

    // 收藏 / 申请 是两个独立状态：
    //   action='interested' (我的收藏 tab) → userAction='interested'
    //   action='applied'    (已申请 tab)   → isApplied=true
    //   action='undecided'  (新机会 tab)   → userAction=null AND isApplied=false
    const where: any = { userId: user.sub, isRelevant: true };
    if (action === 'undecided') {
      where.userAction = null;
      where.isApplied = false;
    } else if (action === 'applied') {
      where.isApplied = true;
    } else if (action === 'interested') {
      where.userAction = 'interested';
    } else if (action) {
      where.userAction = action;
    }

    // 并行：取分页数据 + 真实总数
    // 修复 bug：之前用 items.length 当 total，传 limit=1 取统计时永远返回 1。
    const [items, total] = await Promise.all([
      this.prisma.campMatchResult.findMany({
        where,
        orderBy: [
          { overallRecommendation: 'asc' }, // recommend 在前
          { extractedDeadline: 'asc' },
          { createdAt: 'desc' },
        ],
        take,
        include: { camp: { include: { university: true, department: true } } },
      }),
      this.prisma.campMatchResult.count({ where }),
    ]);

    return {
      data: items.map((it) => this.serializeMatchResult(it, it.camp)),
      total,
    };
  }

  @Get('match/:id')
  @ApiOperation({ summary: '获取单条匹配结果详情' })
  async detail(@Param('id') id: string, @CurrentUser() user: any) {
    const item = await this.prisma.campMatchResult.findUnique({
      where: { id },
      include: { camp: { include: { university: true, department: true } } },
    });
    if (!item) throw new NotFoundException('匹配结果不存在');
    if (item.userId !== user.sub) throw new BadRequestException('无权访问');
    return this.serializeMatchResult(item, item.camp);
  }

  @Patch('match/:id/action')
  @ApiOperation({
    summary: '更新用户决策',
    description: '收藏 / 申请 是两个独立状态。' +
      'interested/reset/skipped/hidden → 操作 userAction；' +
      'applied/unapplied → 操作 isApplied。'
  })
  async updateAction(
    @Param('id') id: string,
    @Body() body: UpdateMatchActionDto,
    @CurrentUser() user: any,
  ) {
    const item = await this.prisma.campMatchResult.findUnique({
      where: { id },
      include: { camp: true },
    });
    if (!item) throw new NotFoundException('匹配结果不存在');
    if (item.userId !== user.sub) throw new BadRequestException('无权访问');

    // 'applied' / 'unapplied' 走 isApplied 字段 —— 不影响 userAction（收藏态）
    if (body.action === 'applied' || body.action === 'unapplied') {
      const isApplied = body.action === 'applied';
      const updated = await this.prisma.campMatchResult.update({
        where: { id },
        data: {
          isApplied,
          appliedAt: isApplied ? new Date() : null,
        } as any,
      });
      return {
        id: updated.id,
        userAction: updated.userAction,
        userActionAt: updated.userActionAt,
        isApplied: (updated as any).isApplied,
        appliedAt: (updated as any).appliedAt,
      };
    }

    // 其它 action 操作 userAction（含 reset 清空收藏）
    const nextAction = body.action === 'reset' ? null : body.action;
    const updated = await this.prisma.campMatchResult.update({
      where: { id },
      data: { userAction: nextAction, userActionAt: nextAction ? new Date() : null },
    });

    // 收藏（interested）时自动注册截止前 7/5/3 天提醒
    if (nextAction === 'interested') {
      await this.scheduleDeadlineReminders(user.sub, item.campId, item.extractedDeadline || item.camp?.deadline);
    }
    // 取消收藏时清掉提醒（applied 状态不应影响提醒——applied 跟 deadline 提醒无直接关系，所以也不删）
    if (nextAction !== 'interested') {
      await this.prisma.reminder
        .deleteMany({
          where: { userId: user.sub, campId: item.campId, status: 'pending' },
        })
        .catch(() => null);
    }

    return {
      id: updated.id,
      userAction: updated.userAction,
      userActionAt: updated.userActionAt,
      isApplied: (updated as any).isApplied,
      appliedAt: (updated as any).appliedAt,
    };
  }

  /**
   * 收藏后注册 3 个 deadline 提醒（7/5/3 天前），过期的不创建。
   * 复用现有 Reminder 表 + scheduler 推送链路。
   * 注：小程序端会同步调用 wx.requestSubscribeMessage 申请 3 次 quota，
   *     若用户拒绝或部分授权，scheduler 发送时 WeChat API 会丢弃多余调用。
   */
  private async scheduleDeadlineReminders(userId: string, campId: string, deadline: Date | null) {
    if (!deadline) return;
    const now = Date.now();
    const dl = deadline.getTime();
    const offsets = [7 * 24 * 3600 * 1000, 5 * 24 * 3600 * 1000, 3 * 24 * 3600 * 1000];
    for (const off of offsets) {
      const remindAt = new Date(dl - off);
      if (remindAt.getTime() <= now) continue;
      try {
        // 用 (userId, campId, remindTime) 作为去重 key — 同一时间点不重复
        const exists = await this.prisma.reminder.findFirst({
          where: { userId, campId, remindTime: remindAt, status: 'pending' },
        });
        if (!exists) {
          await this.prisma.reminder.create({
            data: {
              userId,
              campId,
              remindTime: remindAt,
              status: 'pending',
            },
          });
        }
      } catch (e: any) {
        this.logger.warn(`注册提醒失败: ${e?.message}`);
      }
    }
    this.logger.log(`[收藏后] 已为 user=${userId} camp=${campId} 注册截止前 7/5/3 天提醒`);
  }

  // ============ 私有工具 ============

  private buildProfileForLlm(profile: any): StudentProfileForLlm {
    if (!profile) return {};
    let targetMajors: string[] = [];
    if (profile.targetMajors) {
      try {
        const parsed = JSON.parse(profile.targetMajors);
        if (Array.isArray(parsed)) targetMajors = parsed.map(String);
      } catch {}
    }
    return {
      undergraduateSchool: profile.schoolName || undefined,
      undergraduateMajor: profile.major || undefined,
      gpa: profile.gpa || undefined,
      gradeRankPercent: profile.gradeRankPercent ?? undefined,
      gradeRankText: profile.gradeRankText || undefined,
      englishStandardized:
        profile.englishStandardized ||
        (profile.englishType && profile.englishScore != null
          ? `${profile.englishType}:${profile.englishScore}`
          : undefined),
      researchExperience: profile.researchExperience || undefined,
      competitionAwards: profile.competitionAwards || undefined,
      targetMajors,
    };
  }

  private async upsertCamp(data: any) {
    // 简单按 sourceUrl 去重
    const existing = await this.prisma.campInfo.findFirst({
      where: { sourceUrl: data.sourceUrl },
    });

    // 尝试从 URL / title 推断学校
    const resolvedUni = await this.resolveUniversityFromUrlAndTitle(
      data.sourceUrl || '',
      data.title || '',
    );
    const universityId = resolvedUni?.id;
    if (!universityId) {
      throw new BadRequestException('无法识别公告所属学校（URL/标题里没有匹配到任何推免高校）');
    }

    if (existing) {
      return this.prisma.campInfo.update({
        where: { id: existing.id },
        data: {
          universityId, // 重新提交时也更新学校归属（修正之前错配到清华的情况）
          title: data.title || existing.title,
          rawContent: data.rawContent || existing.rawContent,
          announcementType: data.announcementType || existing.announcementType,
          deadline: data.deadline ? new Date(data.deadline) : existing.deadline,
          startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
          endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
          location: data.location || existing.location,
          updatedAt: new Date(),
        },
      });
    }
    return this.prisma.campInfo.create({
      data: {
        title: data.title,
        sourceUrl: data.sourceUrl,
        universityId,
        rawContent: data.rawContent,
        announcementType: data.announcementType || 'summer_camp',
        deadline: data.deadline ? new Date(data.deadline) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        location: data.location,
        status: 'published',
      },
    });
  }

  private serializeMatchResult(match: any, camp: any) {
    let keyReqs: any[] = [];
    try {
      if (match.keyRequirements) {
        keyReqs = JSON.parse(match.keyRequirements);
      }
    } catch {}
    // 没有 departmentId 视为"全校通用"公告
    const isUniversityLevel = !camp.departmentId;
    return {
      id: match.id,
      camp: {
        id: camp.id,
        title: camp.title,
        sourceUrl: camp.sourceUrl,
        universityName: camp.university?.name,
        universityLogo: camp.university?.logo || null,
        departmentName: camp.department?.name,
        announcementType: camp.announcementType,
        isUniversityLevel,
        levelBadge: isUniversityLevel ? '全校通用' : null,
      },
      isRelevant: match.isRelevant,
      campType: match.campType,
      matchesUserMajor: match.matchesUserMajor,
      extractedDeadline: match.extractedDeadline,
      extractedStartDate: match.extractedStartDate,
      extractedEndDate: match.extractedEndDate,
      extractedLocation: match.extractedLocation,
      extractedSummary: match.extractedSummary,
      keyRequirements: keyReqs,
      overallRecommendation: match.overallRecommendation,
      matchScore: match.matchScore,
      reasoning: match.reasoning,
      userAction: match.userAction,
      userActionAt: match.userActionAt,
      isApplied: !!match.isApplied,
      appliedAt: match.appliedAt || null,
      createdAt: match.createdAt,
    };
  }

  /**
   * 从 URL 和 title 里推断公告所属的 985 学校。
   * 顺序：先按 URL 的 host 关键字 → 再按 title 的学校名匹配 → 命中即返回。
   */
  private async resolveUniversityFromUrlAndTitle(url: string, title: string) {
    // 1. 按域名识别
    const DOMAIN_TO_NAME: Record<string, string> = {
      'sjtu.edu.cn': '上海交通大学',
      'tsinghua.edu.cn': '清华大学',
      'pku.edu.cn': '北京大学',
      'bjmu.edu.cn': '北京大学', // 北医
      'fudan.edu.cn': '复旦大学',
      'zju.edu.cn': '浙江大学',
      'nju.edu.cn': '南京大学',
      'ustc.edu.cn': '中国科学技术大学',
      'sysu.edu.cn': '中山大学',
      'ruc.edu.cn': '中国人民大学',
      'buaa.edu.cn': '北京航空航天大学',
      'bit.edu.cn': '北京理工大学',
      'bnu.edu.cn': '北京师范大学',
      'cau.edu.cn': '中国农业大学',
      'muc.edu.cn': '中央民族大学',
      'nankai.edu.cn': '南开大学',
      'tju.edu.cn': '天津大学',
      'dlut.edu.cn': '大连理工大学',
      'neu.edu.cn': '东北大学',
      'jlu.edu.cn': '吉林大学',
      'hit.edu.cn': '哈尔滨工业大学',
      'tongji.edu.cn': '同济大学',
      'ecnu.edu.cn': '华东师范大学',
      'seu.edu.cn': '东南大学',
      'xmu.edu.cn': '厦门大学',
      'sdu.edu.cn': '山东大学',
      'ouc.edu.cn': '中国海洋大学',
      'whu.edu.cn': '武汉大学',
      'hust.edu.cn': '华中科技大学',
      'hnu.edu.cn': '湖南大学',
      'csu.edu.cn': '中南大学',
      'scut.edu.cn': '华南理工大学',
      'scu.edu.cn': '四川大学',
      'cqu.edu.cn': '重庆大学',
      'uestc.edu.cn': '电子科技大学',
      'xjtu.edu.cn': '西安交通大学',
      'nwpu.edu.cn': '西北工业大学',
      'nwsuaf.edu.cn': '西北农林科技大学',
      'lzu.edu.cn': '兰州大学',
      'nudt.edu.cn': '国防科技大学',
    };

    let matchedName: string | null = null;
    const lcUrl = (url || '').toLowerCase();
    for (const [domain, name] of Object.entries(DOMAIN_TO_NAME)) {
      if (lcUrl.includes(domain)) {
        matchedName = name;
        break;
      }
    }

    // 2. 按 title 关键字匹配（兜底）
    if (!matchedName) {
      for (const name of Object.values(DOMAIN_TO_NAME)) {
        if (title.includes(name)) {
          matchedName = name;
          break;
        }
      }
    }

    if (matchedName) {
      const uni = await this.prisma.university.findFirst({ where: { name: matchedName } });
      if (uni) return uni;
    }

    // 都没命中 → 返回 null（caller 应该拒绝创建错误归属的公告，而不是落到"第一所 985"）
    // 之前的兜底逻辑会把所有未识别 URL 默认归属到 ID 最小的学校，造成数据污染
    this.logger.warn(`无法从 URL "${url}" 或标题 "${title}" 识别学校 → 拒绝写入`);
    return null;
  }
}
