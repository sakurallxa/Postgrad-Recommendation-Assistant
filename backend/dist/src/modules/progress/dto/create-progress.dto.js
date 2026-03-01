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
exports.CreateProgressDto = exports.PROGRESS_STATUS_VALUES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.PROGRESS_STATUS_VALUES = [
    'followed',
    'preparing',
    'submitted',
    'waiting_admission',
    'admitted',
    'waiting_outstanding',
    'outstanding_published',
];
class CreateProgressDto {
}
exports.CreateProgressDto = CreateProgressDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '夏令营ID' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateProgressDto.prototype, "campId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '初始状态',
        enum: exports.PROGRESS_STATUS_VALUES,
        default: 'followed',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.PROGRESS_STATUS_VALUES),
    __metadata("design:type", Object)
], CreateProgressDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '下一步动作提示', maxLength: 120 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateProgressDto.prototype, "nextAction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注', maxLength: 240 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], CreateProgressDto.prototype, "note", void 0);
//# sourceMappingURL=create-progress.dto.js.map