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
exports.CampService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CampService = class CampService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(params) {
        const { page, limit, universityId, universityIds, majorId, status, year } = params;
        const skip = (page - 1) * limit;
        const where = {};
        if (status && status !== 'all') {
            where.status = status;
        }
        else if (!status) {
            where.status = 'published';
        }
        if (universityIds && universityIds.length > 0) {
            where.universityId = { in: universityIds };
        }
        else if (universityId) {
            where.universityId = universityId;
        }
        if (majorId)
            where.majorId = majorId;
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
    async findOne(id) {
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
            throw new common_1.NotFoundException('夏令营不存在');
        }
        return camp;
    }
};
exports.CampService = CampService;
exports.CampService = CampService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CampService);
//# sourceMappingURL=camp.service.js.map