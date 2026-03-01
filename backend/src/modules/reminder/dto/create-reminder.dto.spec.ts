import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReminderDto } from './create-reminder.dto';

describe('CreateReminderDto', () => {
  it('回归: remindTime 缺失时应校验失败', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      campId: 'camp_123',
    });

    const errors = await validate(dto);
    const fields = errors.map((e) => e.property);

    expect(fields).toContain('remindTime');
  });

  it('合法请求应通过校验', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      campId: 'camp_123',
      remindTime: '2026-06-25T09:00:00Z',
      content: '提醒内容',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

