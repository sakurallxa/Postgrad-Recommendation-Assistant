import axios from 'axios';
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

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
};

const UNIVERSITY_LOGO_MAP: Array<{
  name?: string;
  websiteIncludes?: string;
  logo: string;
}> = [
  {
    name: '北京大学',
    websiteIncludes: 'pku.edu.cn',
    logo: 'https://www.pku.edu.cn/Uploads/Picture/2019/12/26/s5e04176fbbfa3.png',
  },
];

const DEFAULT_SITE_RULE = {
  hosts: [] as string[],
  fallbackLocation: undefined as string | undefined,
  fallbackKeywords: [] as string[],
  locationLabels: ['活动地点', '举办地点', '营期地点', '报到地点', '线下地点', '活动安排地点'],
  deadlineLabels: ['报名截止时间', '报名截止日期', '截止时间', '截止日期', '申请截止', '网申截止'],
  eventLabels: ['活动时间', '举办时间', '营期时间', '夏令营时间', '报到时间'],
};

const siteRuleAliasesPath = path.resolve(backendRoot, '..', 'shared', 'site-rule-aliases.json');

const SITE_RULES: Array<{
  hosts: string[];
  fallbackLocation?: string;
  fallbackKeywords?: string[];
  locationLabels?: string[];
  deadlineLabels?: string[];
  eventLabels?: string[];
}> = fs.existsSync(siteRuleAliasesPath)
  ? JSON.parse(fs.readFileSync(siteRuleAliasesPath, 'utf-8'))
  : [];

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsCodeLikeContent(value: string | null | undefined): boolean {
  const text = normalizeText(value);
  if (!text) return false;
  return /(var\s+\w+\s*=|window\.location|window\.navigator|document\.ready|function\s*\(|<script|\$\.\w+\()/iu.test(
    text,
  );
}

function stripHtml(html: string): string {
  return normalizeText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, ' ')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/p>|<\/div>|<\/li>|<\/tr>|<\/td>|<\/section>/giu, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/giu, ' ')
      .replace(/&amp;/giu, '&')
      .replace(/&lt;/giu, '<')
      .replace(/&gt;/giu, '>')
      .replace(/&#34;|&quot;/giu, '"')
      .replace(/&#39;|&apos;/giu, "'"),
  );
}

function parseDateParts(raw: string, fallbackYear?: number): Date | null {
  const text = normalizeText(raw);
  if (!text) return null;

  let year = fallbackYear;
  let month: number | null = null;
  let day: number | null = null;
  let hour = 0;
  let minute = 0;

  const full = text.match(
    /(?:(\d{4})[年./-])?(\d{1,2})[月./-](\d{1,2})日?(?:\s*(\d{1,2})[:：](\d{2}))?/u,
  );
  if (!full) return null;

  if (full[1]) year = Number(full[1]);
  month = Number(full[2]);
  day = Number(full[3]);
  if (full[4]) hour = Number(full[4]);
  if (full[5]) minute = Number(full[5]);

  if (!year || !month || !day) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function extractDateCandidates(text: string, fallbackYear?: number): Date[] {
  const matches = text.match(
    /(?:(?:\d{4}[年./-])?\d{1,2}[月./-]\d{1,2}日?(?:\s*\d{1,2}[:：]\d{2})?)/gu,
  );
  const result: Date[] = [];
  for (const match of matches || []) {
    const dt = parseDateParts(match, fallbackYear);
    if (dt) result.push(dt);
  }
  return result;
}

function toIso(dt: Date | null | undefined): string | null {
  if (!dt || Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function isReasonableDeadline(deadline: Date | null, publishDate: Date | null): boolean {
  if (!deadline || Number.isNaN(deadline.getTime())) return false;
  if (!publishDate || Number.isNaN(publishDate.getTime())) return true;
  const min = publishDate.getTime() - 24 * 60 * 60 * 1000;
  const max = publishDate.getTime() + 400 * 24 * 60 * 60 * 1000;
  return deadline.getTime() >= min && deadline.getTime() <= max;
}

function extractTitleYear(title: string | null | undefined): number | null {
  const match = String(title || '').match(/\b(20\d{2})年/u);
  if (!match) return null;
  return Number(match[1]);
}

function isWithinTitleYearWindow(date: Date | null, titleYear: number | null): boolean {
  if (!date || Number.isNaN(date.getTime()) || !titleYear) return true;
  return date.getUTCFullYear() >= titleYear - 1 && date.getUTCFullYear() <= titleYear;
}

function isReasonableStartDate(startDate: Date | null, publishDate: Date | null): boolean {
  if (!startDate || Number.isNaN(startDate.getTime())) return false;
  if (!publishDate || Number.isNaN(publishDate.getTime())) return true;
  const min = publishDate.getTime() - 14 * 24 * 60 * 60 * 1000;
  const max = publishDate.getTime() + 400 * 24 * 60 * 60 * 1000;
  return startDate.getTime() >= min && startDate.getTime() <= max;
}

function isReasonableEndDate(
  endDate: Date | null,
  publishDate: Date | null,
  startDate: Date | null,
): boolean {
  if (!endDate || Number.isNaN(endDate.getTime())) return false;
  if (startDate && !Number.isNaN(startDate.getTime()) && endDate.getTime() < startDate.getTime()) {
    return false;
  }
  if (!publishDate || Number.isNaN(publishDate.getTime())) return true;
  const min = publishDate.getTime() - 14 * 24 * 60 * 60 * 1000;
  const max = publishDate.getTime() + 400 * 24 * 60 * 60 * 1000;
  return endDate.getTime() >= min && endDate.getTime() <= max;
}

function extractKeywordWindow(text: string, labels: string[], maxChars = 160): string {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[：:]?\\s*([^\\n]{0,${maxChars}})`, 'iu');
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1]);
    }
  }
  return '';
}

function mergeSiteRule(
  rule?:
    | {
        hosts?: string[];
        fallbackLocation?: string;
        fallbackKeywords?: string[];
        locationLabels?: string[];
        deadlineLabels?: string[];
        eventLabels?: string[];
      }
    | null,
) {
  return {
    hosts: [...DEFAULT_SITE_RULE.hosts, ...((rule?.hosts as string[] | undefined) || [])],
    fallbackLocation: rule?.fallbackLocation || DEFAULT_SITE_RULE.fallbackLocation,
    fallbackKeywords: Array.from(
      new Set([...(DEFAULT_SITE_RULE.fallbackKeywords || []), ...((rule?.fallbackKeywords as string[] | undefined) || [])]),
    ),
    locationLabels: Array.from(
      new Set([...(DEFAULT_SITE_RULE.locationLabels || []), ...((rule?.locationLabels as string[] | undefined) || [])]),
    ),
    deadlineLabels: Array.from(
      new Set([...(DEFAULT_SITE_RULE.deadlineLabels || []), ...((rule?.deadlineLabels as string[] | undefined) || [])]),
    ),
    eventLabels: Array.from(
      new Set([...(DEFAULT_SITE_RULE.eventLabels || []), ...((rule?.eventLabels as string[] | undefined) || [])]),
    ),
  };
}

function resolveSiteRule(sourceUrl: string | null | undefined, website?: string | null) {
  let hostname = '';
  try {
    hostname = new URL(String(sourceUrl || '')).hostname.toLowerCase();
  } catch {
    hostname = '';
  }
  const websiteHost = (() => {
    try {
      return new URL(String(website || '')).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();

  if (hostname) {
    const aliasRule = SITE_RULES.find((rule) =>
      rule.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
    );
    if (aliasRule) return mergeSiteRule(aliasRule);
  }

  if (websiteHost && (!hostname || hostname === websiteHost || hostname.endsWith(`.${websiteHost}`))) {
    return mergeSiteRule({ hosts: [websiteHost] });
  }

  if (websiteHost) {
    return mergeSiteRule({ hosts: [websiteHost] });
  }

  if (hostname) {
    return mergeSiteRule({ hosts: [hostname] });
  }

  return mergeSiteRule(null);
}

function extractDeadline(
  text: string,
  fallbackYear?: number,
  sourceUrl?: string | null,
  website?: string | null,
): string | null {
  const siteRule = resolveSiteRule(sourceUrl, website);
  const snippets = [
    extractKeywordWindow(
      text,
      [
        ...(siteRule?.deadlineLabels || []),
        '报名截止时间',
        '报名截止日期',
        '截止时间',
        '截止日期',
        '申请截止',
        '网申截止',
      ],
    ),
  ].filter(Boolean);

  for (const snippet of snippets) {
    const dates = extractDateCandidates(snippet, fallbackYear);
    if (dates.length > 0) {
      return toIso(dates[dates.length - 1]);
    }
  }
  return null;
}

function extractEventWindow(
  text: string,
  fallbackYear?: number,
  sourceUrl?: string | null,
  website?: string | null,
): { startDate: string | null; endDate: string | null } {
  const siteRule = resolveSiteRule(sourceUrl, website);
  const snippet = extractKeywordWindow(
    text,
    [
      ...(siteRule?.eventLabels || []),
      '活动时间',
      '举办时间',
      '营期时间',
      '夏令营时间',
      '报到时间',
    ],
    200,
  );
  if (!snippet) {
    return { startDate: null, endDate: null };
  }
  const dates = extractDateCandidates(snippet, fallbackYear);
  if (dates.length === 0) {
    return { startDate: null, endDate: null };
  }
  return {
    startDate: toIso(dates[0]),
    endDate: toIso(dates[dates.length - 1]),
  };
}

function cleanLocation(raw: string | null | undefined): string | null {
  let text = normalizeText(raw);
  if (!text || containsCodeLikeContent(text)) return null;
  text = text.replace(/^(?:活动地点|举办地点|营期地点|报到地点|地点|地址)[：:]\s*/iu, '');
  text = text.replace(/^(?:线下地点|活动安排地点)[：:]\s*/iu, '');
  text = text.replace(/[；;。]\s*$/, '').trim();
  if (text.length < 4) return null;
  if (/(报名|截止|发布|邮箱|电话|推荐信|申请表)/u.test(text)) return null;
  if (
    !/(区|县|镇|街道|路|号|楼|室|校区|学院|医院|会议室|中心|线上|线下|腾讯会议|zoom|燕园|学院路)/iu.test(
      text,
    )
  ) {
    return null;
  }
  return text;
}

function extractLocation(text: string, sourceUrl?: string | null, website?: string | null): string | null {
  const siteRule = resolveSiteRule(sourceUrl, website);
  const direct = extractKeywordWindow(
    text,
    [
      ...(siteRule?.locationLabels || []),
      '活动地点',
      '举办地点',
      '营期地点',
      '报到地点',
      '线下地点',
      '活动安排地点',
    ],
    120,
  );
  const cleaned = cleanLocation(direct);
  if (cleaned) return cleaned;

  const inlinePatterns = [
    /(?:活动时间地点|时间地点)[：:]?\s*([^\n]{4,120})/iu,
    /(北大医学部[^\n；。]{0,80}(?:逸夫楼|药学楼|生化楼|教室|会议室|报告厅))/iu,
    /((?:药学楼|逸夫楼|生化楼|门诊楼|住院部)[^\n；。]{0,80}(?:教室|会议室|报告厅|办公室))/iu,
    /((?:海淀院区|昌平院区)[：:]\s*北京市[^\n；。]{4,120})/iu,
    /(北京市西城区西什库大街8号北京大学第一医院)/iu,
  ];
  for (const pattern of inlinePatterns) {
    const match = text.match(pattern);
    const normalized = cleanLocation(match?.[1] || '');
    if (normalized) return normalized;
  }

  if (siteRule?.fallbackLocation) {
    const normalizedText = normalizeText(text);
    const keywords = siteRule.fallbackKeywords || [];
    if (keywords.some((keyword) => normalizedText.includes(keyword)) && !normalizedText.includes('线上')) {
      return siteRule.fallbackLocation;
    }
  }

  return null;
}

async function fetchPageText(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    headers: REQUEST_HEADERS,
    timeout: 20000,
    responseType: 'text',
  });
  return stripHtml(String(response.data || ''));
}

function resolveUniversityLogo(name: string | null | undefined, website: string | null | undefined): string | null {
  const normalizedName = normalizeText(name);
  const normalizedWebsite = normalizeText(website);
  for (const item of UNIVERSITY_LOGO_MAP) {
    if (item.name && item.name === normalizedName) return item.logo;
    if (item.websiteIncludes && normalizedWebsite.includes(item.websiteIncludes)) return item.logo;
  }
  return null;
}

async function main() {
  const universities = await prisma.university.findMany({
    select: { id: true, name: true, website: true, logo: true },
  });

  let logosTouched = 0;
  for (const university of universities) {
    if (university.logo) continue;
    const logo = resolveUniversityLogo(university.name, university.website);
    if (!logo) continue;
    logosTouched += 1;
    if (!dryRun) {
      await prisma.university.update({
        where: { id: university.id },
        data: { logo },
      });
    }
    console.log(`[university] ${dryRun ? 'would-update' : 'updated'} logo id=${university.id} name=${university.name}`);
  }

  const camps = await prisma.campInfo.findMany({
    where: {
      status: 'published',
    },
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      publishDate: true,
      deadline: true,
      startDate: true,
      endDate: true,
      location: true,
      university: {
        select: { id: true, name: true, website: true, logo: true },
      },
    },
  });

  let campsTouched = 0;
  let fetched = 0;
  let fetchFailed = 0;

  for (const camp of camps) {
    try {
      const pageText = await fetchPageText(camp.sourceUrl);
      fetched += 1;
      const fallbackYear =
        camp.publishDate?.getUTCFullYear() ||
        new Date().getUTCFullYear();
      const titleYear = extractTitleYear(camp.title);
      const shouldRepairDeadline =
        !camp.deadline ||
        !isReasonableDeadline(camp.deadline, camp.publishDate) ||
        !isWithinTitleYearWindow(camp.deadline, titleYear);
      const shouldRepairStartDate =
        !camp.startDate ||
        !isReasonableStartDate(camp.startDate, camp.publishDate) ||
        !isWithinTitleYearWindow(camp.startDate, titleYear);
      const shouldRepairEndDate =
        !camp.endDate ||
        !isReasonableEndDate(camp.endDate, camp.publishDate, camp.startDate) ||
        !isWithinTitleYearWindow(camp.endDate, titleYear);
      const shouldRepairLocation = !camp.location;

      const deadline = shouldRepairDeadline
        ? extractDeadline(pageText, fallbackYear, camp.sourceUrl, camp.university?.website)
        : null;
      const eventWindow = extractEventWindow(
        pageText,
        fallbackYear,
        camp.sourceUrl,
        camp.university?.website,
      );
      const location = shouldRepairLocation
        ? extractLocation(pageText, camp.sourceUrl, camp.university?.website)
        : null;

      const data: Record<string, any> = {};
      if (shouldRepairDeadline) {
        const nextDeadline = deadline ? new Date(deadline) : null;
        data.deadline =
          isReasonableDeadline(nextDeadline, camp.publishDate) &&
          isWithinTitleYearWindow(nextDeadline, titleYear)
            ? nextDeadline
            : null;
      }
      if (shouldRepairStartDate) {
        const nextStartDate = eventWindow.startDate ? new Date(eventWindow.startDate) : null;
        data.startDate =
          isReasonableStartDate(nextStartDate, camp.publishDate) &&
          isWithinTitleYearWindow(nextStartDate, titleYear)
            ? nextStartDate
            : null;
      }
      if (shouldRepairEndDate) {
        const nextStartForValidation =
          (data.startDate as Date | null | undefined) ?? camp.startDate ?? null;
        const nextEndDate = eventWindow.endDate ? new Date(eventWindow.endDate) : null;
        data.endDate =
          isReasonableEndDate(nextEndDate, camp.publishDate, nextStartForValidation || null) &&
          isWithinTitleYearWindow(nextEndDate, titleYear)
            ? nextEndDate
            : null;
      }
      if (location) {
        data.location = location;
      }

      const changedKeys = Object.keys(data).filter((key) => {
        const currentValue = (camp as any)[key];
        const nextValue = data[key];
        if (currentValue instanceof Date && nextValue instanceof Date) {
          return currentValue.getTime() !== nextValue.getTime();
        }
        return currentValue !== nextValue;
      });
      if (changedKeys.length === 0) {
        continue;
      }

      campsTouched += 1;
      if (!dryRun) {
        await prisma.campInfo.update({
          where: { id: camp.id },
          data,
        });
      }
      console.log(
        `[camp] ${dryRun ? 'would-update' : 'updated'} id=${camp.id} title=${camp.title} fields=${changedKeys.join(',')}`,
      );
    } catch (error: any) {
      fetchFailed += 1;
      console.warn(`[camp] fetch-failed id=${camp.id} url=${camp.sourceUrl} err=${error?.message || error}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        universitiesScanned: universities.length,
        logosTouched,
        campsScanned: camps.length,
        campsTouched,
        fetched,
        fetchFailed,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('backfill-camp-metadata failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
