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
    async findAll(page = 1, limit = 20) {
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
    async create(dto) {
        return this.prisma.reminder.create({
            data: dto,
        });
    }
    async remove(id) {
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