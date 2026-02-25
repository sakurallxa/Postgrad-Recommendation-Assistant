import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { QueryUniversityDto } from './dto/query-university.dto';

@Injectable()
export class UniversityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 获取院校列表
   * 支持分页、筛选、关键词搜索和排序
   */
  async findAll(query: QueryUniversityDto) {
    const { page, limit, region, level, keyword, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: any = {};
    
    if (region) {
      where.region = region;
    }
    
    if (level) {
      where.level = level;
    }
    
    if (keyword) {
      where.name = {
        contains: keyword,
      };
    }

    // 构建排序条件
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // 并行查询数据和总数
    const [data, total] = await Promise.all([
      this.prisma.university.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          name: true,
          logo: true,
          region: true,
          level: true,
          website: true,
          priority: true,
          _count: {
            select: {
              majors: true,
              campInfos: true,
            },
          },
        },
      }),
      this.prisma.university.count({ where }),
    ]);

    return {
      data: data.map(uni => ({
        ...uni,
        majorCount: uni._count.majors,
        campInfoCount: uni._count.campInfos,
        _count: undefined,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取院校详情
   * 包含专业列表和夏令营信息
   */
  async findOne(id: string) {
    const university = await this.prisma.university.findUnique({
      where: { id },
      include: {
        majors: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        campInfos: {
          where: { status: 'published' },
          orderBy: { publishDate: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            deadline: true,
            status: true,
          },
        },
      },
    });

    if (!university) {
      throw new NotFoundException('院校不存在');
    }

    return university;
  }

  /**
   * 获取院校专业列表
   */
  async findMajors(universityId: string) {
    // 验证院校是否存在
    const university = await this.prisma.university.findUnique({
      where: { id: universityId },
    });

    if (!university) {
      throw new NotFoundException('院校不存在');
    }

    const majors = await this.prisma.major.findMany({
      where: { universityId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
      },
    });

    return {
      universityId,
      universityName: university.name,
      majors,
      total: majors.length,
    };
  }
}
