import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    universityId?: string;
    universityIds?: string[];
    majorId?: string;
    status?: string;
    year?: number;
  }) {
    const { page, limit, universityId, universityIds, majorId, status, year } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    } else if (!status) {
      // 兼容历史默认行为：未传status时仅返回published
      where.status = 'published';
    }

    if (universityIds && universityIds.length > 0) {
      where.universityId = { in: universityIds };
    } else if (universityId) {
      where.universityId = universityId;
    }

    if (majorId) where.majorId = majorId;

    if (year) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      where.AND = [
        {
          OR: [
            { publishDate: { gte: yearStart, lt: yearEnd } },
            { deadline: { gte: yearStart, lt: yearEnd } },
            { startDate: { gte: yearStart, lt: yearEnd } },
            { endDate: { gte: yearStart, lt: yearEnd } },
          ],
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.campInfo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishDate: 'desc' },
        include: {
          university: true,
          major: true,
        },
      }),
      this.prisma.campInfo.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const camp = await this.prisma.campInfo.findUnique({
      where: { id },
      include: {
        university: {
          select: {
            id: true,
            name: true,
            logo: true,
            level: true,
            website: true,
          },
        },
        major: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });

    if (!camp) {
      throw new NotFoundException('夏令营不存在');
    }

    return camp;
  }
}
