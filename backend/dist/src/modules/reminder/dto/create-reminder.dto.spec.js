"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const create_reminder_dto_1 = require("./create-reminder.dto");
describe('CreateReminderDto', () => {
    it('回归: remindTime 缺失时应校验失败', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(create_reminder_dto_1.CreateReminderDto, {
            campId: 'camp_123',
        });
        const errors = await (0, class_validator_1.validate)(dto);
        const fields = errors.map((e) => e.property);
        expect(fields).toContain('remindTime');
    });
    it('合法请求应通过校验', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(create_reminder_dto_1.CreateReminderDto, {
            campId: 'camp_123',
            remindTime: '2026-06-25T09:00:00Z',
            content: '提醒内容',
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors).toHaveLength(0);
    });
});
//# sourceMappingURL=create-reminder.dto.spec.js.map