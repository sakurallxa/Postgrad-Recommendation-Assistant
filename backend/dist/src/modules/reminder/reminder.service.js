"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReminderService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ReminderService = class ReminderService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(userId, page = 1, limit = 20, status) {
        const skip = (page - 1) * limit;
        const take = Math.min(limit, 100);
        const where = { userId };
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
    async create(userId, dto) {
        const data = {
            userId,
            campId: dto.campId,
            remindTime: new Date(dto.remindTime),
        };
        if (dto.content) {
            data.content = dto.content;
        }
        return this.prisma.reminder.create({ data });
    }
    async remove(userId, id) {
        const reminder = await this.prisma.reminder.findUnique({
            where: { id },
        });
        if (!reminder) {
            throw new common_1.NotFoundException('提醒不存在');
        }
        if (reminder.userId !== userId) {
            throw new common_1.ForbiddenException('无权删除此提醒');
        }
        return this.prisma.reminder.delete({
            where: { id },
        });
    }
};
exports.ReminderService = ReminderService;
exports.ReminderService = ReminderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReminderService);
//# sourceMappingURL=reminder.service.js.map