import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取提醒列表
   * @param userId 用户ID（必填）
   * @param page 页码
   * @param limit 每页数量
   * @param status 状态筛选（可选）
   * @returns 分页提醒列表
   */
  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    // 构建查询条件
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.reminder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          camp: {
            select: {
              id: true,
              title: true,
              deadline: true,
              university: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.reminder.count({ where }),
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
