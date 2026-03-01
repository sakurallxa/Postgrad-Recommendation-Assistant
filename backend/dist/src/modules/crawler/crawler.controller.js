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
exports.CrawlerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const crawler_service_1 = require("./crawler.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let CrawlerController = class CrawlerController {
    constructor(crawlerService) {
        this.crawlerService = crawlerService;
    }
    async trigger(universityId, priority, yearSpan) {
        const parsedYearSpan = yearSpan ? Number(yearSpan) : 3;
        return this.crawlerService.trigger(universityId, priority, Number.isFinite(parsedYearSpan) && parsedYearSpan > 0 ? parsedYearSpan : 3);
    }
    async getLogs() {
        return this.crawlerService.getLogs();
    }
    async getTaskStatus(taskId) {
        return this.crawlerService.getTaskStatus(taskId);
    }
};
exports.CrawlerController = CrawlerController;
__decorate([
    (0, common_1.Post)('trigger'),
    (0, swagger_1.ApiOperation)({ summary: '手动触发爬虫', description: '触发爬虫任务，支持全量爬取或指定院校' }),
    (0, swagger_1.ApiQuery)({ name: 'universityId', required: false, description: '指定院校ID' }),
    (0, swagger_1.ApiQuery)({ name: 'priority', required: false, description: '优先级筛选 (P0/P1/P2/P3)' }),
    (0, swagger_1.ApiQuery)({ name: 'yearSpan', required: false, description: '抓取近N年数据，默认3年' }),
    __param(0, (0, common_1.Query)('universityId')),
    __param(1, (0, common_1.Query)('priority')),
    __param(2, (0, common_1.Query)('yearSpan')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CrawlerController.prototype, "trigger", null);
__decorate([
    (0, common_1.Get)('logs'),
    (0, swagger_1.ApiOperation)({ summary: '获取爬虫日志' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CrawlerController.prototype, "getLogs", null);
__decorate([
    (0, common_1.Get)('tasks/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '获取任务状态', description: '查询指定爬虫任务的执行状态' }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CrawlerController.prototype, "getTaskStatus", null);
exports.CrawlerController = CrawlerController = __decorate([
    (0, swagger_1.ApiTags)('爬虫'),
    (0, common_1.Controller)('crawler'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [crawler_service_1.CrawlerService])
], CrawlerController);
//# sourceMappingURL=crawler.controller.js.map