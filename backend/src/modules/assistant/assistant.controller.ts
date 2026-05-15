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
  @IsIn(['interested', 'applied', 'skipped', 'hidden'])
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

    // 1. 抓 URL
    const fetched = await this.urlFetcher.fetch(body.url);
    if (!fetched) {
      throw new BadRequestException('URL 无法访问，请检查链接');
    }
    // 检查是否是 404/错误页（学校网站常返回 200 但内容是错误页）
    if (fetched.content.length < 200 || /404|找不到|page not found|页面不存在/i.test(fetched.title)) {
      throw new BadRequestException(
        `这个 URL 的内容看起来是错误页或已失效（标题: "${fetched.title || '?'}"），请贴一个真实的公告详情页链接`,
      );
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

    const where: any = { userId: user.sub, isRelevant: true };
    if (action === 'undecided') where.userAction = null;
    else if (action) where.userAction = action;

    const items = await this.prisma.campMatchResult.findMany({
      where,
      orderBy: [
        { overallRecommendation: 'asc' }, // recommend 在前
        { extractedDeadline: 'asc' },
        { createdAt: 'desc' },
      ],
      take,
      include: { camp: { include: { university: true, department: true } } },
    });

    return {
      data: items.map((it) => this.serializeMatchResult(it, it.camp)),
      total: items.length,
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
  @ApiOperation({ summary: '更新用户决策（感兴趣/已申请/跳过/隐藏）' })
  async updateAction(
    @Param('id') id: string,
    @Body() body: UpdateMatchActionDto,
    @CurrentUser() user: any,
  ) {
    const item = await this.prisma.campMatchResult.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('匹配结果不存在');
    if (item.userId !== user.sub) throw new BadRequestException('无权访问');
    const updated = await this.prisma.campMatchResult.update({
      where: { id },
      data: { userAction: body.action, userActionAt: new Date() },
    });
    return { id: updated.id, userAction: updated.userAction, userActionAt: updated.userActionAt };
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
    // 第一所 985 大学作为默认（避免 NOT NULL 错误）
    const fallbackUniversity = await this.prisma.university.findFirst({
      where: { level: '985' },
    });
    const universityId = fallbackUniversity?.id;
    if (!universityId) {
      throw new BadRequestException('数据库尚未初始化 universities，请先 seed');
    }

    if (existing) {
      return this.prisma.campInfo.update({
        where: { id: existing.id },
        data: {
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
    return {
      id: match.id,
      camp: {
        id: camp.id,
        title: camp.title,
        sourceUrl: camp.sourceUrl,
        universityName: camp.university?.name,
        departmentName: camp.department?.name,
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
      createdAt: match.createdAt,
    };
  }
}
