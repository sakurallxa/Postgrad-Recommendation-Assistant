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
exports.UniversityService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UniversityService = class UniversityService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const { page, limit, region, level, keyword, sortBy, sortOrder } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (region) {
            where.region = region;
        }
        if (level) {
            where.level = level;
        }
        if (keyword) {
            where.name = {
                contains: keyword,
            };
        }
        const orderBy = {};
        orderBy[sortBy] = sortOrder;
        const [data, total] = await Promise.all([
            this.prisma.university.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                select: {
                    id: true,
                    name: true,
                    logo: true,
                    region: true,
                    level: true,
                    website: true,
                    priority: true,
                    _count: {
                        select: {
                            majors: true,
                            campInfos: true,
                        },
                    },
                },
            }),
            this.prisma.university.count({ where }),
        ]);
        return {
            data: data.map(uni => ({
                ...uni,
                majorCount: uni._count.majors,
                campInfoCount: uni._count.campInfos,
                _count: undefined,
            })),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async findOne(id) {
        const university = await this.prisma.university.findUnique({
            where: { id },
            include: {
                majors: {
                    select: {
                        id: true,
                        name: true,
                        category: true,
                    },
                },
                campInfos: {
                    where: { status: 'published' },
                    orderBy: { publishDate: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        title: true,
                        deadline: true,
                        status: true,
                    },
                },
            },
        });
        if (!university) {
            throw new common_1.NotFoundException('院校不存在');
        }
        return university;
    }
    async findMajors(universityId) {
        const university = await this.prisma.university.findUnique({
            where: { id: universityId },
        });
        if (!university) {
            throw new common_1.NotFoundException('院校不存在');
        }
        const majors = await this.prisma.major.findMany({
            where: { universityId },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                category: true,
            },
        });
        return {
            universityId,
            universityName: university.name,
            majors,
            total: majors.length,
        };
    }
};
exports.UniversityService = UniversityService;
exports.UniversityService = UniversityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UniversityService);
//# sourceMappingURL=university.service.js.map