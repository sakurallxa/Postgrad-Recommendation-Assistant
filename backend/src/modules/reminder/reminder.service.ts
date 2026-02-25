import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.reminder.findMany({
      orderBy: { createdAt: 'desc' },
    });
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
