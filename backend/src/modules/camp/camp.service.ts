import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    universityId?: string;
    majorId?: string;
  }) {
    const { page, limit, universityId, majorId } = params;
    const skip = (page - 1) * limit;

    const where: any = { status: 'published' };
    if (universityId) where.universityId = universityId;
    if (majorId) where.majorId = majorId;

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
}
