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
exports.CreateProgressEventDto = exports.PROGRESS_EVENT_TYPE_VALUES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.PROGRESS_EVENT_TYPE_VALUES = [
    'deadline',
    'materials',
    'admission_result',
    'outstanding_result',
];
class CreateProgressEventDto {
}
exports.CreateProgressEventDto = CreateProgressEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '夏令营ID' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "campId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '变更类型', enum: exports.PROGRESS_EVENT_TYPE_VALUES }),
    (0, class_validator_1.IsIn)(exports.PROGRESS_EVENT_TYPE_VALUES),
    __metadata("design:type", Object)
], CreateProgressEventDto.prototype, "eventType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '变更字段', maxLength: 80 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "fieldName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '变更前值', maxLength: 500 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "oldValue", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '变更后值', maxLength: 500 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "newValue", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '来源类型', default: 'crawler' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "sourceType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '来源地址' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "sourceUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '来源更新时间' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "sourceUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '可信度标签（可不传，服务端自动计算）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['high', 'medium', 'low']),
    __metadata("design:type", String)
], CreateProgressEventDto.prototype, "confidenceLabel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '可信度分值 0-1（可不传，服务端自动计算）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProgressEventDto.prototype, "confidenceScore", void 0);
//# sourceMappingURL=create-progress-event.dto.js.map