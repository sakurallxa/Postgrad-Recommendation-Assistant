import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';

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

  /**
   * 创建提醒
   * @param userId 当前登录用户ID（从JWT获取）
   * @param dto 创建提醒DTO
   * @returns 创建的提醒
   */
  async create(userId: string, dto: CreateReminderDto) {
    return this.prisma.reminder.create({
      data: {
        ...dto,
        userId, // 强制使用当前登录用户的ID
      },
    });
  }

  /**
   * 删除提醒
   * @param userId 当前登录用户ID
   * @param id 提醒ID
   * @returns 删除的提醒
   * @throws NotFoundException 提醒不存在
   * @throws ForbiddenException 用户无权删除此提醒
   */
  async remove(userId: string, id: string) {
    // 先查询提醒，验证归属权
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw new NotFoundException('提醒不存在');
    }

    // 验证当前用户是否有权删除此提醒
    if (reminder.userId !== userId) {
      throw new ForbiddenException('无权删除此提醒');
    }

    return this.prisma.reminder.delete({
      where: { id },
    });
  }
}
