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
exports.UpdateProgressSubscriptionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateProgressSubscriptionDto {
}
exports.UpdateProgressSubscriptionDto = UpdateProgressSubscriptionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否开启订阅' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateProgressSubscriptionDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '截止时间变更订阅' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateProgressSubscriptionDto.prototype, "deadlineChanged", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '材料要求变更订阅' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateProgressSubscriptionDto.prototype, "materialsChanged", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '入营名单变更订阅' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateProgressSubscriptionDto.prototype, "admissionResultChanged", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '优秀营员结果变更订阅' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateProgressSubscriptionDto.prototype, "outstandingResultChanged", void 0);
//# sourceMappingURL=update-progress-subscription.dto.js.map