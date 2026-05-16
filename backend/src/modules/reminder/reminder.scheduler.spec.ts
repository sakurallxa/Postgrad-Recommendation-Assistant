import axios from 'axios';
import { ReminderScheduler } from './reminder.scheduler';

jest.mock('axios');

describe('ReminderScheduler', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const prisma = {
    reminder: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    progressAlert: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const configService = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        WECHAT_APPID: 'wx_real_appid',
        WECHAT_SECRET: 'wx_real_secret',
        WX_SUBSCRIBE_TEMPLATE_ID: 'tpl_subscribe',
        WX_PROGRESS_CHANGE_TEMPLATE_ID: 'tpl_progress',
        WECHAT_ACTION_TOKEN_ENABLED: 'false',
      };
      return map[key];
    }),
  } as any;

  const openidCryptoService = {
    decrypt: jest.fn(() => 'openid_123'),
  } as any;

  let scheduler: ReminderScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new ReminderScheduler(prisma, configService, openidCryptoService);
    mockedAxios.get.mockResolvedValue({
      data: { access_token: 'wx_access_token' },
    } as any);
    mockedAxios.post.mockResolvedValue({
      data: { errcode: 0, msgid: 'msg_1' },
    } as any);
    prisma.reminder.update.mockResolvedValue({});
    prisma.progressAlert.update.mockResolvedValue({});
    prisma.progressAlert.updateMany.mockResolvedValue({ count: 1 });
  });

  it('普通提醒发送应使用「报名时间提醒」模板字段 thing9 / time7 / thing3', async () => {
    prisma.reminder.findMany.mockResolvedValue([
      {
        id: 'r1',
        templateId: null,
        remindTime: new Date('2026-03-08T10:00:00.000Z'),
        user: { openidCipher: 'cipher' },
        camp: {
          id: 'c1',
          title: '测试夏令营',
          deadline: new Date('2026-03-20T00:00:00.000Z'),
          university: { name: '清华大学' },
        },
      },
    ]);

    await scheduler.scanAndSendReminders();

    const sendPayload = mockedAxios.post.mock.calls[0][1] as any;
    // 新模板字段
    expect(sendPayload.data.thing9).toBeDefined();
    expect(sendPayload.data.thing9.value).toBe('测试夏令营');
    expect(sendPayload.data.time7).toBeDefined();
    // time7 应该是 yyyy年M月d日 HH:mm 格式（微信 time 类要求）
    expect(sendPayload.data.time7.value).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/);
    expect(sendPayload.data.thing3).toBeDefined();
    expect(sendPayload.data.thing3.value).toContain('清华大学');
    // 旧模板字段不应再出现
    expect(sendPayload.data.thing1).toBeUndefined();
    expect(sendPayload.data.time4).toBeUndefined();
  });

  it('普通提醒：thing 字段超 20 字应被截断', async () => {
    prisma.reminder.findMany.mockResolvedValue([
      {
        id: 'r2',
        templateId: null,
        remindTime: new Date('2026-03-08T10:00:00.000Z'),
        user: { openidCipher: 'cipher' },
        camp: {
          id: 'c2',
          // 超过 20 字符的长标题
          title: '北京大学2026年优秀大学生暑期夏令营招生简章信息科学技术学院',
          deadline: new Date('2026-03-20T00:00:00.000Z'),
          university: { name: '北京大学信息科学技术学院' }, // 12 字符 + " · 剩X天" 会超 20
        },
      },
    ]);

    await scheduler.scanAndSendReminders();

    const sendPayload = mockedAxios.post.mock.calls[0][1] as any;
    expect(sendPayload.data.thing9.value.length).toBeLessThanOrEqual(20);
    expect(sendPayload.data.thing3.value.length).toBeLessThanOrEqual(20);
  });

  it('进展变更提醒发送应使用 time4 字段', async () => {
    prisma.progressAlert.findMany.mockResolvedValue([
      {
        id: 'a1',
        actionToken: null,
        title: '截止时间变更',
        createdAt: new Date('2026-03-08T10:00:00.000Z'),
        user: { openidCipher: 'cipher' },
        camp: {
          title: '2026夏令营',
          university: { name: '清华大学' },
        },
        event: {
          eventType: 'deadline',
          fieldName: 'deadline',
          sourceUpdatedAt: new Date('2026-03-08T09:00:00.000Z'),
        },
      },
    ]);

    await scheduler.dispatchProgressWechatAlerts();

    const sendPayload = mockedAxios.post.mock.calls[0][1] as any;
    expect(sendPayload.data.time4).toBeDefined();
    expect(sendPayload.data.time2).toBeUndefined();
    expect(sendPayload.data.thing3.value).toContain('时间更新');
  });

  it('低置信旧事件提醒应退化为通用文案', async () => {
    prisma.progressAlert.findMany.mockResolvedValue([
      {
        id: 'a2',
        actionToken: null,
        title: '材料变更',
        createdAt: new Date('2026-03-08T10:00:00.000Z'),
        user: { openidCipher: 'cipher' },
        camp: {
          title: '2026夏令营',
          university: { name: '清华大学' },
        },
        event: {
          eventType: 'materials',
          fieldName: 'materials',
          sourceUpdatedAt: new Date('2026-03-08T09:00:00.000Z'),
        },
      },
    ]);

    await scheduler.dispatchProgressWechatAlerts();

    const sendPayload = mockedAxios.post.mock.calls[0][1] as any;
    expect(sendPayload.data.thing3.value).toContain('公告更新');
  });
});
