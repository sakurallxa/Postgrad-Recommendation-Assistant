import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [data, total] = await Promise.all([
      this.prisma.reminder.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reminder.count(),
    ]);

    return {
      data,
      meta: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async create(dto: any) {
    return this.prisma.reminder.create({
      data: dto,
    });
  }

  async remove(id: string) {
    return this.prisma.reminder.delete({
      where: { id },
    });
  }
}
