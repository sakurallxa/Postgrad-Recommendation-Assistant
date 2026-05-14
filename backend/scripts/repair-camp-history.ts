import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const backendRoot = path.resolve(__dirname, '..');
const envCandidates = [
  path.join(backendRoot, '.env'),
  path.join(backendRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

const NOISE_TITLE_WORDS = [
  '工作动态',
  '医学教育',
  '通知公告',
  '学工动态',
  '新闻动态',
  '学工信息',
  '发布信息',
];

function containsCodeLikeContent(value: string | null | undefined): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  const patterns = [
    /\bvar\s+[A-Za-z_$][\w$]*\s*=/i,
    /window\.location/i,
    /window\.navigator/i,
    /document\.ready/i,
    /\$\s*\(\s*document\s*\)\s*\.ready/i,
    /function\s*\(/i,
    /\.ajax\s*\(/i,
    /encodeURIComponent\s*\(/i,
    /<script\b/i,
    /MicroMessenger/i,
    /WxShare/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function cleanTitle(raw: string): string {
  let title = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!title) return '';

  title = title.replace(/^var\s+title\s*=\s*/i, '').replace(/^['"`]|['"`;]+$/g, '').trim();

  const noiseAlternation = NOISE_TITLE_WORDS.join('|');
  title = title.replace(new RegExp(`(?:^|\\s)(?:${noiseAlternation})(?=\\s|$)`, 'g'), ' ').trim();
  title = title.replace(/\s*[-|｜_]\s*北京大学[^ ]+$/g, '').trim();
  title = title.replace(/\s+发布日期[:：]?\s*\d{4}[-年./]\d{1,2}[-月./]\d{1,2}.*/g, '').trim();
  title = title.replace(/\s+发布时间[:：]?.*/g, '').trim();
  title = title.replace(/^分享标题[:：]?\s*/i, '').trim();
  title = title.replace(/\s+(?:工作动态|医学教育|通知公告|学工动态|新闻动态|学工信息|发布信息)$/g, '').trim();
  title = title.replace(/^(.{2,40}?)\s+\1(?=关于)/, '$1');
  title = title.replace(/\s+“/g, '“').replace(/”\s+/g, '”');
  title = title.replace(/\s+/g, ' ').trim();

  const guanYuIndex = title.indexOf('关于');
  if (guanYuIndex > 0) {
    const prefix = title.slice(0, guanYuIndex).trim();
    const body = title.slice(guanYuIndex).trim();
    for (let len = Math.min(40, prefix.length); len >= 2; len -= 1) {
      const candidate = prefix.slice(prefix.length - len);
      if (body.startsWith(candidate)) {
        title = `${candidate}${body.slice(candidate.length)}`.trim();
        break;
      }
    }
  }

  return title.replace(/\s+/g, ' ').trim();
}

function isValidPhone(raw: string | null | undefined): boolean {
  const phone = String(raw || '').trim();
  if (!phone) return false;
  return /^(?:0\d{2,3}-\d{7,8}(?:-\d+)?|1[3-9]\d{9})$/.test(phone);
}

function sanitizeAddress(raw: string | null | undefined): string | null {
  let text = String(raw || '').trim();
  if (!text) return null;
  text = text.replace(/^(?:地址|联系地址)[:：]\s*/i, '');
  text = text.replace(/^(?:前以EMS寄至|以EMS寄至|交或以顺丰寄至|以顺丰寄至|寄至|邮寄地址)[:：]\s*/i, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text || null;
}

function isValidAddress(raw: string | null | undefined): boolean {
  const address = sanitizeAddress(raw);
  if (!address) return false;
  if (address.length < 8) return false;
  if (/^(北京市|上海市|天津市|重庆市|香港特别行政区|澳门特别行政区)$/.test(address)) return false;
  return /[区县镇街道路号楼室校区学院医院中心园楼栋层]/.test(address);
}

function safeParseJsonObject(value: string | null | undefined): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  return null;
}

async function main() {
  const camps = await prisma.campInfo.findMany({
    select: {
      id: true,
      title: true,
      contact: true,
      sourceUrl: true,
    },
  });

  let campsTouched = 0;
  let titlesTouched = 0;
  let contactsTouched = 0;

  for (const camp of camps) {
    const data: Record<string, any> = {};

    const cleanedTitle = cleanTitle(camp.title || '');
    if (cleanedTitle && cleanedTitle !== camp.title) {
      data.title = cleanedTitle;
      titlesTouched += 1;
    }

    const contactObj = safeParseJsonObject(camp.contact);
    if (contactObj) {
      const nextContact: Record<string, any> = { ...contactObj };
      let changed = false;

      if (nextContact.phone && !isValidPhone(nextContact.phone)) {
        delete nextContact.phone;
        changed = true;
      }

      const normalizedAddress = sanitizeAddress(nextContact.address);
      if (normalizedAddress !== (nextContact.address ?? null)) {
        nextContact.address = normalizedAddress;
        changed = true;
      }
      if (nextContact.address && !isValidAddress(nextContact.address)) {
        delete nextContact.address;
        changed = true;
      }

      if (Array.isArray(nextContact.other)) {
        const filteredOther = nextContact.other
          .map((item: any) => String(item || '').trim())
          .filter((item: string) => item && !containsCodeLikeContent(item));
        if (filteredOther.length !== nextContact.other.length) {
          nextContact.other = filteredOther;
          changed = true;
        }
        if (filteredOther.length === 0) {
          delete nextContact.other;
        }
      }

      if (nextContact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(nextContact.email))) {
        delete nextContact.email;
        changed = true;
      }

      const hasAnyField = Object.keys(nextContact).length > 0;
      const nextContactJson = hasAnyField ? JSON.stringify(nextContact) : null;
      if (changed && nextContactJson !== camp.contact) {
        data.contact = nextContactJson;
        contactsTouched += 1;
      }
    }

    if (Object.keys(data).length > 0) {
      campsTouched += 1;
      if (!dryRun) {
        await prisma.campInfo.update({ where: { id: camp.id }, data });
      }
      console.log(`[camp] ${dryRun ? 'would-update' : 'updated'} id=${camp.id} title=${JSON.stringify(data.title || camp.title)} source=${camp.sourceUrl}`);
    }
  }

  const events = await prisma.progressChangeEvent.findMany({
    select: { id: true, fieldName: true, oldValue: true, newValue: true, campId: true },
  });

  const codeLikeEventIds = events
    .filter((event) => containsCodeLikeContent(event.oldValue) || containsCodeLikeContent(event.newValue))
    .map((event) => event.id);

  if (codeLikeEventIds.length > 0) {
    if (!dryRun) {
      await prisma.progressChangeEvent.deleteMany({
        where: { id: { in: codeLikeEventIds } },
      });
    }
    console.log(`[progress_change_events] ${dryRun ? 'would-delete' : 'deleted'} count=${codeLikeEventIds.length}`);
  }

  console.log(JSON.stringify({
    dryRun,
    campsScanned: camps.length,
    campsTouched,
    titlesTouched,
    contactsTouched,
    codeLikeEvents: codeLikeEventIds.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('repair-camp-history failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
