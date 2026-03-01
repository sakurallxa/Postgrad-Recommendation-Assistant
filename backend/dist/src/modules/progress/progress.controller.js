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
exports.ProgressController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const progress_service_1 = require("./progress.service");
const create_progress_dto_1 = require("./dto/create-progress.dto");
const update_progress_status_dto_1 = require("./dto/update-progress-status.dto");
const update_progress_subscription_dto_1 = require("./dto/update-progress-subscription.dto");
const create_progress_event_dto_1 = require("./dto/create-progress-event.dto");
const snooze_progress_alert_dto_1 = require("./dto/snooze-progress-alert.dto");
let ProgressController = class ProgressController {
    constructor(progressService) {
        this.progressService = progressService;
    }
    async findAll(userId, page, limit, status) {
        return this.progressService.findAll(userId, page, limit, status);
    }
    async create(userId, dto) {
        return this.progressService.create(userId, dto);
    }
    async listAlerts(userId, page, limit, status) {
        return this.progressService.listAlerts(userId, page, limit, status);
    }
    async handleAlert(userId, alertId) {
        return this.progressService.handleAlert(userId, alertId);
    }
    async snoozeAlert(userId, alertId, dto) {
        return this.progressService.snoozeAlert(userId, alertId, dto.hours);
    }
    async createEvent(dto) {
        return this.progressService.createChangeEvent(dto);
    }
    async findOne(userId, progressId) {
        return this.progressService.findOne(userId, progressId);
    }
    async updateStatus(userId, progressId, dto) {
        return this.progressService.updateStatus(userId, progressId, dto);
    }
    async getSubscription(userId, progressId) {
        return this.progressService.getSubscription(userId, progressId);
    }
    async updateSubscription(userId, progressId, dto) {
        return this.progressService.updateSubscription(userId, progressId, dto);
    }
};
exports.ProgressController = ProgressController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取我的申请进展列表' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, type: String }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Query)('page', new common_1.DefaultValuePipe(1), common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit', new common_1.DefaultValuePipe(20), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, String]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '创建申请进展' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_progress_dto_1.CreateProgressDto]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('alerts'),
    (0, swagger_1.ApiOperation)({ summary: '获取申请进展提醒列表' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, type: String }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Query)('page', new common_1.DefaultValuePipe(1), common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit', new common_1.DefaultValuePipe(20), common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, String]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "listAlerts", null);
__decorate([
    (0, common_1.Patch)('alerts/:alertId/handle'),
    (0, swagger_1.ApiOperation)({ summary: '标记提醒为已处理' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Param)('alertId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "handleAlert", null);
__decorate([
    (0, common_1.Patch)('alerts/:alertId/snooze'),
    (0, swagger_1.ApiOperation)({ summary: '延后提醒' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Param)('alertId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, snooze_progress_alert_dto_1.SnoozeProgressAlertDto]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "snoozeAlert", null);
__decorate([
    (0, common_1.Post)('events'),
    (0, swagger_1.ApiOperation)({ summary: '创建变更事件并按订阅分发提醒' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_progress_event_dto_1.CreateProgressEventDto]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "createEvent", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取申请进展详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, swagger_1.ApiOperation)({ summary: '更新申请进展状态' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_progress_status_dto_1.UpdateProgressStatusDto]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Get)(':id/subscription'),
    (0, swagger_1.ApiOperation)({ summary: '获取进展订阅设置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "getSubscription", null);
__decorate([
    (0, common_1.Patch)(':id/subscription'),
    (0, swagger_1.ApiOperation)({ summary: '更新进展订阅设置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_progress_subscription_dto_1.UpdateProgressSubscriptionDto]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "updateSubscription", null);
exports.ProgressController = ProgressController = __decorate([
    (0, swagger_1.ApiTags)('申请进展'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('progress'),
    __metadata("design:paramtypes", [progress_service_1.ProgressService])
], ProgressController);
//# sourceMappingURL=progress.controller.js.map