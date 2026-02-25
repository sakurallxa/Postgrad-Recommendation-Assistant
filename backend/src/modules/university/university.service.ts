import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UniversityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    region?: string;
    level?: string;
  }) {
    const { page, limit, region, level } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (region) where.region = region;
    if (level) where.level = level;

    const [data, total] = await Promise.all([
      this.prisma.university.findMany({
        where,
        skip,
        take: limit,
        orderBy: { priority: 'asc' },
      }),
      this.prisma.university.count({ where }),
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
}
