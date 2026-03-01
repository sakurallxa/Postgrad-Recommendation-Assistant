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
var UserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UserService = UserService_1 = class UserService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(UserService_1.name);
    }
    safeJsonParse(jsonString, defaultValue) {
        if (!jsonString) {
            return defaultValue;
        }
        try {
            return JSON.parse(jsonString);
        }
        catch (error) {
            this.logger.error(`JSON解析失败: ${jsonString}`, error.message);
            return defaultValue;
        }
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                createdAt: true,
                selection: {
                    select: {
                        universityIds: true,
                        majorIds: true,
                    },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('用户不存在');
        }
        return {
            ...user,
            selection: user.selection || {
                universityIds: '[]',
                majorIds: '[]',
            },
        };
    }
    async getSelection(userId) {
        const selection = await this.prisma.userSelection.findUnique({
            where: { userId },
        });
        if (!selection) {
            return {
                universityIds: [],
                majorIds: [],
            };
        }
        const universityIds = this.safeJsonParse(selection.universityIds, []);
        const majorIds = this.safeJsonParse(selection.majorIds, []);
        const universities = await this.prisma.university.findMany({
            where: { id: { in: universityIds } },
            select: {
                id: true,
                name: true,
                logo: true,
                level: true,
            },
        });
        const majors = await this.prisma.major.findMany({
            where: { id: { in: majorIds } },
            select: {
                id: true,
                name: true,
                category: true,
                university: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        return {
            universities,
            majors,
            totalUniversities: universities.length,
            totalMajors: majors.length,
        };
    }
    async updateSelection(userId, dto) {
        const { universityIds, majorIds } = dto;
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('用户不存在');
        }
        if (universityIds && universityIds.length > 0) {
            const validUniversities = await this.prisma.university.findMany({
                where: { id: { in: universityIds } },
                select: { id: true },
            });
            const validIds = validUniversities.map(u => u.id);
            const invalidIds = universityIds.filter(id => !validIds.includes(id));
            if (invalidIds.length > 0) {
                throw new common_1.NotFoundException(`无效的院校ID: ${invalidIds.join(', ')}`);
            }
        }
        if (majorIds && majorIds.length > 0) {
            const validMajors = await this.prisma.major.findMany({
                where: { id: { in: majorIds } },
                select: { id: true },
            });
            const validIds = validMajors.map(m => m.id);
            const invalidIds = majorIds.filter(id => !validIds.includes(id));
            if (invalidIds.length > 0) {
                throw new common_1.NotFoundException(`无效的专业ID: ${invalidIds.join(', ')}`);
            }
        }
        const selection = await this.prisma.userSelection.upsert({
            where: { userId },
            update: {
                universityIds: universityIds ? JSON.stringify(universityIds) : undefined,
                majorIds: majorIds ? JSON.stringify(majorIds) : undefined,
            },
            create: {
                userId,
                universityIds: JSON.stringify(universityIds || []),
                majorIds: JSON.stringify(majorIds || []),
            },
        });
        return {
            message: '用户选择更新成功',
            selection: {
                universityIds: this.safeJsonParse(selection.universityIds, []),
                majorIds: this.safeJsonParse(selection.majorIds, []),
            },
        };
    }
};
exports.UserService = UserService;
exports.UserService = UserService = UserService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserService);
//# sourceMappingURL=user.service.js.map