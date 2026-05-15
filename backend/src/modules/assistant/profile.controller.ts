import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
  BadRequestException,
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
  @ApiOperation({ summary: '更新我的档案（部分更新）' })
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

    return this.serialize(profile);
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
