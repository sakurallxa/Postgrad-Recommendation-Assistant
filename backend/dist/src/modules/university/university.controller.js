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
exports.UniversityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const university_service_1 = require("./university.service");
const query_university_dto_1 = require("./dto/query-university.dto");
let UniversityController = class UniversityController {
    constructor(universityService) {
        this.universityService = universityService;
    }
    async findAll(query) {
        return this.universityService.findAll(query);
    }
    async findOne(id) {
        return this.universityService.findOne(id);
    }
    async findMajors(id) {
        return this.universityService.findMajors(id);
    }
};
exports.UniversityController = UniversityController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取院校列表', description: '支持分页、筛选、关键词搜索和排序' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_university_dto_1.QueryUniversityDto]),
    __metadata("design:returntype", Promise)
], UniversityController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取院校详情', description: '获取院校详细信息，包含专业列表和夏令营信息' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '院校ID', type: 'string' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UniversityController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/majors'),
    (0, swagger_1.ApiOperation)({ summary: '获取院校专业列表', description: '获取指定院校的所有专业' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '院校ID', type: 'string' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UniversityController.prototype, "findMajors", null);
exports.UniversityController = UniversityController = __decorate([
    (0, swagger_1.ApiTags)('院校'),
    (0, common_1.Controller)('universities'),
    __metadata("design:paramtypes", [university_service_1.UniversityService])
], UniversityController);
//# sourceMappingURL=university.controller.js.map