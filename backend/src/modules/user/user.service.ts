import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSelectionDto } from './dto/update-selection.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    return {
      message: '用户选择更新成功',
      selection: {
        universityIds: this.safeJsonParse<string[]>(selection.universityIds, []),
        majorIds: this.safeJsonParse<string[]>(selection.majorIds, []),
      },
    };
  }
}
