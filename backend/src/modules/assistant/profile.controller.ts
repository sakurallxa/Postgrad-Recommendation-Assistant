import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  Headers,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class UpdateProfileDto {
  // 必填核心
  @IsOptional()
  @IsString()
  @MaxLength(100)
  schoolName?: string;

  @IsOptional()
  @IsString()
  schoolLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  major?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gpa?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  gradeRankPercent?: number;

  @IsOptional()
  @IsString()
  gradeRankText?: string;

  @IsOptional()
  @IsString()
  englishType?: string;

  @IsOptional()
  @IsNumber()
  englishScore?: number;

  // 推荐填
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  researchExperience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  competitionAwards?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  preferredDirection?: string;

  // 核心新字段：目标专业
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetMajors?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetNote?: string;
}

@ApiTags('用户档案')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '获取我的档案' })
  async get(@CurrentUser() user: any) {
    if (!user?.sub) throw new BadRequestException('需要登录');
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.sub },
    });
    const result = profile
      ? this.serialize(profile)
      : { exists: false, completeness: 0 };
    return result;
  }

  @Put()
  @ApiOperation({
    summary: '更新我的档案（部分更新）',
    description: '同步把该用户已生成的 CampMatchResult 失效化 + 后台重新跑 LLM 匹配，避免"档案已填但 AI 仍说没填"的过期分析。',
  })
  async update(@Body() body: UpdateProfileDto, @CurrentUser() user: any) {
    if (!user?.sub) throw new BadRequestException('需要登录');

    const data: any = { ...body };
    if (body.targetMajors !== undefined) {
      data.targetMajors = JSON.stringify(body.targetMajors);
    }
    if (body.englishType && body.englishScore != null) {
      data.englishStandardized = `${body.englishType}:${body.englishScore}`;
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { userId: user.sub },
      create: { userId: user.sub, ...data },
      update: data,
    });

    // ============ 关键：失效化旧的 CampMatchResult，触发用最新档案重新匹配 ============
    // 不阻塞响应；用户拿到 200 后台慢慢跑 LLM
    this.invalidateAndRematchForUser(user.sub).catch((e) =>
      this.logger.warn(`[profile-update] 重新匹配触发失败: ${e?.message}`),
    );

    return this.serialize(profile);
  }

  /**
   * 失效化该用户全部已生成的 CampMatchResult，并触发后台用最新档案重新跑 LLM 匹配。
   *
   * 重算范围：用户**所有现存 match** ∪ 当前订阅 dept 对应的 camp。
   * 同时覆盖"已收藏但取消订阅的 camp"和"将出现在新机会里的 camp"。
   */
  private async invalidateAndRematchForUser(userId: string) {
    // 1) 用户已有的 match（覆盖所有历史收藏 / orphan 等）
    const existing = await this.prisma.campMatchResult.findMany({
      where: { userId },
      select: { campId: true },
    });
    const fromExistingMatches = new Set(existing.map((m) => m.campId));

    // 2) 用户当前订阅 dept 对应的 camp + university-level orphan
    const subs = await this.prisma.userDepartmentSubscription.findMany({
      where: { userId, active: true },
      select: { departmentId: true },
    });
    const deptIds = subs.map((s) => s.departmentId);
    let fromSubsCamps: { id: string }[] = [];
    if (deptIds.length > 0) {
      const depts = await this.prisma.department.findMany({
        where: { id: { in: deptIds } },
        select: { universityId: true },
      });
      const universityIds = Array.from(new Set(depts.map((d) => d.universityId)));
      fromSubsCamps = await this.prisma.campInfo.findMany({
        where: {
          OR: [
            { departmentId: { in: deptIds } },
            { AND: [{ departmentId: null }, { universityId: { in: universityIds } }] },
          ],
        },
        select: { id: true },
      });
    }

    const allCampIds = new Set<string>([
      ...fromExistingMatches,
      ...fromSubsCamps.map((c) => c.id),
    ]);
    if (allCampIds.size === 0) return;
    const campIds = Array.from(allCampIds);

    const deleted = await this.prisma.campMatchResult.deleteMany({
      where: { userId, campId: { in: campIds } },
    });

    const { MatchSchedulerSingleton } = require('../crawl-job/match-scheduler');
    const matchScheduler = MatchSchedulerSingleton(
      this.prisma,
      (this as any).configService || null,
      console as any,
    );
    await matchScheduler.scheduleMatchingForUser(userId, campIds);

    this.logger.log(
      `[profile-update] user=${userId.slice(0, 8)} fromExisting=${fromExistingMatches.size} fromSubs=${fromSubsCamps.length} 总 ${campIds.length}，删 ${deleted.count}`,
    );
  }

  private serialize(profile: any) {
    let targetMajors: string[] = [];
    if (profile.targetMajors) {
      try {
        targetMajors = JSON.parse(profile.targetMajors);
      } catch {}
    }
    const completeness = this.calcCompleteness(profile);
    return {
      exists: true,
      id: profile.id,
      schoolName: profile.schoolName,
      schoolLevel: profile.schoolLevel,
      major: profile.major,
      gpa: profile.gpa,
      gradeRankPercent: profile.gradeRankPercent,
      gradeRankText: profile.gradeRankText,
      englishType: profile.englishType,
      englishScore: profile.englishScore,
      englishStandardized: profile.englishStandardized,
      researchExperience: profile.researchExperience,
      competitionAwards: profile.competitionAwards,
      preferredDirection: profile.preferredDirection,
      targetMajors,
      targetNote: profile.targetNote,
      completeness,
      updatedAt: profile.updatedAt,
    };
  }

  /** 0-100 档案完整度（影响 AI 判断质量） */
  private calcCompleteness(p: any): number {
    let score = 0;
    if (p.schoolName) score += 10;
    if (p.major) score += 10;
    if (p.gpa) score += 15;
    if (p.gradeRankPercent != null || p.gradeRankText) score += 10;
    if (p.englishType && p.englishScore != null) score += 15;
    if (p.targetMajors) score += 15; // 关键
    if (p.researchExperience) score += 10;
    if (p.competitionAwards) score += 10;
    if (p.preferredDirection || p.targetNote) score += 5;
    return Math.min(100, score);
  }
}
