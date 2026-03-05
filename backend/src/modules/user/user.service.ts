import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSelectionDto } from './dto/update-selection.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { ProgressService } from '../progress/progress.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progressService: ProgressService,
  ) {}

  /**
   * 安全解析JSON字符串
   * @param jsonString JSON字符串
   * @param defaultValue 默认值
   * @returns 解析后的数据或默认值
   */
  private safeJsonParse<T>(jsonString: string | null | undefined, defaultValue: T): T {
    if (!jsonString) {
      return defaultValue;
    }
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      this.logger.error(`JSON解析失败: ${jsonString}`, error.message);
      return defaultValue;
    }
  }

  private normalizeProfileText(value?: string): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeProfileNumber(value?: number): number | null {
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private buildProfileCompleteness(profile: {
    education: string | null;
    major: string | null;
    gradeRankPercent: number | null;
    englishScore: number | null;
  }) {
    const requiredFilled = [
      profile.education,
      profile.major,
      profile.gradeRankPercent,
      profile.englishScore,
    ].filter((value) => value !== null && value !== '').length;

    const status = requiredFilled === 0 ? 'empty' : requiredFilled === 4 ? 'complete' : 'partial';
    return {
      requiredFilled,
      totalRequired: 4,
      status,
    };
  }

  private toStudentProfileResponse(profile: any) {
    if (!profile) {
      return {
        profile: null,
        completeness: {
          requiredFilled: 0,
          totalRequired: 4,
          status: 'empty',
        },
      };
    }

    const normalized = {
      schoolName: this.normalizeProfileText(profile.schoolName),
      schoolLevel: this.normalizeProfileText(profile.schoolLevel),
      education: this.normalizeProfileText(profile.education),
      major: this.normalizeProfileText(profile.major),
      rankPercent: this.normalizeProfileNumber(profile.gradeRankPercent),
      rankText: this.normalizeProfileText(profile.gradeRankText),
      gpa: this.normalizeProfileText(profile.gpa),
      englishType: this.normalizeProfileText(profile.englishType) || 'none',
      englishScore: this.normalizeProfileNumber(profile.englishScore),
      subjectRanking: this.normalizeProfileText(profile.subjectRanking) || '不确定',
      researchExperience: this.normalizeProfileText(profile.researchExperience) || 'unknown',
      competitionAwards: this.normalizeProfileText(profile.competitionAwards) || 'unknown',
      preferredDirection: this.normalizeProfileText(profile.preferredDirection),
      targetNote: this.normalizeProfileText(profile.targetNote),
      updatedAt: profile.updatedAt,
    };

    return {
      profile: normalized,
      completeness: this.buildProfileCompleteness({
        education: normalized.education,
        major: normalized.major,
        gradeRankPercent: normalized.rankPercent,
        englishScore: normalized.englishScore,
      }),
    };
  }

  /**
   * 获取用户信息
   * 注意：出于隐私保护，不返回openid
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        // openid: true, // 隐私字段不返回
        createdAt: true,
        selection: {
          select: {
            universityIds: true,
            majorIds: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      ...user,
      selection: user.selection || {
        universityIds: '[]',
        majorIds: '[]',
      },
    };
  }

  /**
   * 获取用户选择
   */
  async getSelection(userId: string) {
    const selection = await this.prisma.userSelection.findUnique({
      where: { userId },
    });

    if (!selection) {
      return {
        universityIds: [],
        majorIds: [],
      };
    }

    // 解析JSON字符串（使用安全解析方法）
    const universityIds = this.safeJsonParse<string[]>(selection.universityIds, []);
    const majorIds = this.safeJsonParse<string[]>(selection.majorIds, []);

    // 获取院校详情
    const universities = await this.prisma.university.findMany({
      where: { id: { in: universityIds } },
      select: {
        id: true,
        name: true,
        logo: true,
        level: true,
      },
    });

    // 获取专业详情
    const majors = await this.prisma.major.findMany({
      where: { id: { in: majorIds } },
      select: {
        id: true,
        name: true,
        category: true,
        university: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      universities,
      majors,
      totalUniversities: universities.length,
      totalMajors: majors.length,
    };
  }

  /**
   * 更新用户选择
   */
  async updateSelection(userId: string, dto: UpdateSelectionDto) {
    const { universityIds, majorIds } = dto;

    // 验证用户是否存在
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 验证院校ID是否有效
    if (universityIds && universityIds.length > 0) {
      const validUniversities = await this.prisma.university.findMany({
        where: { id: { in: universityIds } },
        select: { id: true },
      });
      
      const validIds = validUniversities.map(u => u.id);
      const invalidIds = universityIds.filter(id => !validIds.includes(id));
      
      if (invalidIds.length > 0) {
        throw new NotFoundException(`无效的院校ID: ${invalidIds.join(', ')}`);
      }
    }

    // 验证专业ID是否有效
    if (majorIds && majorIds.length > 0) {
      const validMajors = await this.prisma.major.findMany({
        where: { id: { in: majorIds } },
        select: { id: true },
      });
      
      const validIds = validMajors.map(m => m.id);
      const invalidIds = majorIds.filter(id => !validIds.includes(id));
      
      if (invalidIds.length > 0) {
        throw new NotFoundException(`无效的专业ID: ${invalidIds.join(', ')}`);
      }
    }

    const previousSelection = await this.prisma.userSelection.findUnique({
      where: { userId },
      select: { universityIds: true },
    });
    const previousUniversityIds = this.safeJsonParse<string[]>(
      previousSelection?.universityIds,
      [],
    );

    // 更新或创建用户选择
    const selection = await this.prisma.userSelection.upsert({
      where: { userId },
      update: {
        universityIds: universityIds ? JSON.stringify(universityIds) : undefined,
        majorIds: majorIds ? JSON.stringify(majorIds) : undefined,
      },
      create: {
        userId,
        universityIds: JSON.stringify(universityIds || []),
        majorIds: JSON.stringify(majorIds || []),
      },
    });
    const currentUniversityIds = this.safeJsonParse<string[]>(selection.universityIds, []);
    const addedUniversityIds = currentUniversityIds.filter((id) => !previousUniversityIds.includes(id));
    const removedUniversityIds = previousUniversityIds.filter((id) => !currentUniversityIds.includes(id));

    await this.progressService.syncSchoolDefaultSubscriptionsForUserSelection(
      userId,
      addedUniversityIds,
      removedUniversityIds,
    );

    return {
      message: '用户选择更新成功',
      selection: {
        universityIds: currentUniversityIds,
        majorIds: this.safeJsonParse<string[]>(selection.majorIds, []),
      },
    };
  }

  async getStudentProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    return this.toStudentProfileResponse(profile);
  }

  async updateStudentProfile(userId: string, dto: UpdateStudentProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        schoolName: this.normalizeProfileText(dto.schoolName),
        schoolLevel: this.normalizeProfileText(dto.schoolLevel),
        education: this.normalizeProfileText(dto.education),
        major: this.normalizeProfileText(dto.major),
        gradeRankPercent: this.normalizeProfileNumber(dto.rankPercent),
        gradeRankText: this.normalizeProfileText(dto.rankText),
        gpa: this.normalizeProfileText(dto.gpa),
        englishType: this.normalizeProfileText(dto.englishType) || 'none',
        englishScore: this.normalizeProfileNumber(dto.englishScore),
        subjectRanking: this.normalizeProfileText(dto.subjectRanking) || '不确定',
        researchExperience: this.normalizeProfileText(dto.researchExperience) || 'unknown',
        competitionAwards: this.normalizeProfileText(dto.competitionAwards) || 'unknown',
        preferredDirection: this.normalizeProfileText(dto.preferredDirection),
        targetNote: this.normalizeProfileText(dto.targetNote),
      },
      update: {
        schoolName: this.normalizeProfileText(dto.schoolName),
        schoolLevel: this.normalizeProfileText(dto.schoolLevel),
        education: this.normalizeProfileText(dto.education),
        major: this.normalizeProfileText(dto.major),
        gradeRankPercent: this.normalizeProfileNumber(dto.rankPercent),
        gradeRankText: this.normalizeProfileText(dto.rankText),
        gpa: this.normalizeProfileText(dto.gpa),
        englishType: this.normalizeProfileText(dto.englishType) || 'none',
        englishScore: this.normalizeProfileNumber(dto.englishScore),
        subjectRanking: this.normalizeProfileText(dto.subjectRanking) || '不确定',
        researchExperience: this.normalizeProfileText(dto.researchExperience) || 'unknown',
        competitionAwards: this.normalizeProfileText(dto.competitionAwards) || 'unknown',
        preferredDirection: this.normalizeProfileText(dto.preferredDirection),
        targetNote: this.normalizeProfileText(dto.targetNote),
      },
    });

    return this.toStudentProfileResponse(profile);
  }
}
