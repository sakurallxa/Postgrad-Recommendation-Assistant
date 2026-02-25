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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const camp_service_1 = require("./camp.service");
let CampController = class CampController {
    constructor(campService) {
        this.campService = campService;
    }
    async findAll(page = 1, limit = 20, universityId, majorId) {
        return this.campService.findAll({ page, limit, universityId, majorId });
    }
    async findOne(id) {
        const camp = await this.campService.findOne(id);
        if (!camp) {
            throw new common_1.NotFoundException('夏令营不存在');
        }
        return camp;
    }
};
exports.CampController = CampController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取夏令营列表' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('universityId')),
    __param(3, (0, common_1.Query)('majorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], CampController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取夏令营详情', description: '获取夏令营详细信息，包含关联院校和专业' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '夏令营ID', type: 'string' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampController.prototype, "findOne", null);
exports.CampController = CampController = __decorate([
    (0, swagger_1.ApiTags)('夏令营'),
    (0, common_1.Controller)('camps'),
    __metadata("design:paramtypes", [camp_service_1.CampService])
], CampController);
//# sourceMappingURL=camp.controller.js.map