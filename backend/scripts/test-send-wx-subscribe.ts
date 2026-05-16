/**
 * 微信订阅消息 - 真实发送测试脚本
 *
 * 用途：在不依赖 cron 调度 / DB 状态的前提下，直接调用微信 API 验证：
 *   1. 当前 .env 里的 WX_SUBSCRIBE_TEMPLATE_ID 是否正确
 *   2. 字段映射 thing9 / time7 / thing3 是否能通过微信侧校验（避免 47003）
 *   3. 用户的订阅 quota 是否可用
 *
 * 前置条件：
 *   - 用户必须先在小程序内点过「收藏」/「订阅截止提醒」消耗一次 quota
 *   - 否则会拿到 43101 (用户拒绝接收消息) 错误
 *
 * 用法（三选一）：
 *   # 1) 自动用最近登录的用户（最方便，测试自己用）
 *   npx ts-node scripts/test-send-wx-subscribe.ts --latest
 *
 *   # 2) 指定 userId（从 DB 查到 openidCipher 自动解密）
 *   npx ts-node scripts/test-send-wx-subscribe.ts --user-id <userId>
 *
 *   # 3) 直接指定明文 openid（适用于知道 openid 的场景）
 *   npx ts-node scripts/test-send-wx-subscribe.ts --openid <openid>
 *
 * 可选参数：
 *   --title    公告标题，默认 "测试夏令营公告"
 *   --school   学校名，默认 "测试学校"
 *   --days     距离截止剩余天数，默认 7
 *   --template 覆盖 .env 里的模板 ID
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function parseKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('OPENID_ENCRYPTION_KEY 未配置');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  }
  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) return utf8;
  throw new Error('OPENID_ENCRYPTION_KEY 必须是 32 字节密钥');
}

function decryptOpenid(cipherText: string): string {
  const key = parseKey(process.env.OPENID_ENCRYPTION_KEY);
  const [ivB64, tagB64, dataB64] = cipherText.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}

async function resolveOpenidFromDB(userIdOrLatest: string): Promise<{ userId: string; openid: string }> {
  const prisma = new PrismaClient();
  try {
    let user: any;
    if (userIdOrLatest === 'latest') {
      user = await prisma.user.findFirst({
        where: { OR: [{ openidCipher: { not: null } }, { openid: { not: null } }] },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, openid: true, openidCipher: true, updatedAt: true },
      });
    } else {
      user = await prisma.user.findUnique({
        where: { id: userIdOrLatest },
        select: { id: true, openid: true, openidCipher: true },
      });
    }
    if (!user) throw new Error(`找不到用户: ${userIdOrLatest}`);

    // 调试：打印用户字段状态，便于排查 cipher 格式异常
    console.log(`[debug] user.id=${user.id}, hasPlainOpenid=${!!user.openid}, hasCipher=${!!user.openidCipher}, cipherLen=${user.openidCipher?.length || 0}`);
    if (user.openidCipher) {
      const parts = user.openidCipher.split(':');
      console.log(`[debug] cipher split parts: ${parts.length} (expect 3: iv:tag:data)`);
    }

    let openid: string | null = null;
    if (user.openidCipher) {
      const parts = user.openidCipher.split(':');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        try {
          openid = decryptOpenid(user.openidCipher);
        } catch (e: any) {
          console.warn(`[debug] decrypt 失败，fallback 到明文 openid: ${e.message}`);
        }
      } else {
        console.warn(`[debug] openidCipher 格式异常（非 iv:tag:data），fallback 到明文 openid`);
      }
    }
    if (!openid && user.openid) {
      openid = user.openid;
      console.log(`[debug] 使用明文 openid 字段`);
    }
    if (!openid) throw new Error(`用户 ${user.id} 没有可用 openid`);
    return { userId: user.id, openid };
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function clampThing(text: string, max = 20): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function formatWxTime(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const dd = date.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${dd}日 ${hh}:${mi}`;
}

function buildTip(school: string, days: number): string {
  let daysText: string;
  if (days < 0) daysText = '已过期';
  else if (days === 0) daysText = '今日截止';
  else daysText = `剩${days}天`;
  const combined = `${school} · ${daysText}`;
  if (combined.length <= 20) return combined;
  return clampThing(daysText);
}

async function getAccessToken(appid: string, secret: string): Promise<string> {
  const resp = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid, secret },
    timeout: 10000,
  });
  if (resp.data.access_token) return resp.data.access_token;
  throw new Error(`获取 access_token 失败: ${JSON.stringify(resp.data)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 解析 openid —— 三种方式优先级：--openid > --user-id > --latest
  let openid = args.openid;
  let resolvedFrom = 'cli';
  if (!openid) {
    if (args['user-id']) {
      const r = await resolveOpenidFromDB(args['user-id']);
      openid = r.openid;
      resolvedFrom = `DB user-id=${r.userId}`;
    } else if (args.latest === 'true' || args.latest) {
      const r = await resolveOpenidFromDB('latest');
      openid = r.openid;
      resolvedFrom = `DB latest user=${r.userId}`;
    }
  }
  if (!openid) {
    console.error('❌ 必须提供 --openid <openid> 或 --user-id <userId> 或 --latest 之一');
    console.error('   推荐: npx ts-node scripts/test-send-wx-subscribe.ts --latest');
    process.exit(1);
  }
  console.log(`✓ openid 来源: ${resolvedFrom}`);

  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;
  if (!appid || appid === 'wx_appid_placeholder' || !secret) {
    console.error('❌ .env 里 WECHAT_APPID / WECHAT_SECRET 未配置或仍是占位符');
    process.exit(1);
  }

  const templateId = args.template || process.env.WX_SUBSCRIBE_TEMPLATE_ID;
  if (!templateId) {
    console.error('❌ .env 里 WX_SUBSCRIBE_TEMPLATE_ID 未配置');
    process.exit(1);
  }

  const title = args.title || '测试夏令营公告';
  const school = args.school || '测试学校';
  const days = args.days ? parseInt(args.days, 10) : 7;

  const deadline = new Date(Date.now() + days * 86400000);
  deadline.setHours(18, 0, 0, 0); // 默认 18:00 截止

  const payload = {
    touser: openid,
    template_id: templateId,
    page: '/pages/index/index',
    data: {
      thing9: { value: clampThing(title) },
      time7: { value: formatWxTime(deadline) },
      thing3: { value: buildTip(school, days) },
    },
  };

  console.log('====== 发送参数 ======');
  console.log('appid:        ', appid);
  console.log('template_id:  ', templateId);
  console.log('touser:       ', openid);
  console.log('data:         ', JSON.stringify(payload.data, null, 2));
  console.log('======================\n');

  try {
    console.log('→ 正在获取 access_token ...');
    const accessToken = await getAccessToken(appid, secret);
    console.log('  ✓ access_token 拿到（前 16 位）:', accessToken.slice(0, 16) + '...');

    console.log('→ 正在发送订阅消息 ...');
    const resp = await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
      payload,
      { timeout: 10000 },
    );

    console.log('\n====== 微信 API 响应 ======');
    console.log(JSON.stringify(resp.data, null, 2));
    console.log('==========================\n');

    if (resp.data.errcode === 0) {
      console.log('✅ 发送成功！请去微信里查看推送（公众号 · 服务通知）');
    } else {
      console.log(`❌ 发送失败：errcode=${resp.data.errcode} errmsg=${resp.data.errmsg}`);
      // 常见错误说明
      const hints: Record<number, string> = {
        40003: 'openid 无效（不是当前小程序的真实 openid，或拼写错）',
        43101: '用户拒绝接收消息 / 未授权订阅 / quota 已用完（最常见，需小程序内再点一次"订阅"）',
        47003: '模板字段格式错误（最可能：time7 不是合法日期格式，或 thing 类超 20 字符）',
        40037: '模板 ID 不存在',
        41028: '模板权限不足（模板未在小程序后台启用）',
      };
      const hint = hints[resp.data.errcode];
      if (hint) console.log('   提示：', hint);
    }
  } catch (err: any) {
    console.error('❌ 请求异常:', err.message);
    if (err.response?.data) {
      console.error('   响应:', JSON.stringify(err.response.data));
    }
    process.exit(1);
  }
}

main();
