import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

for (const envPath of [
  path.join(backendRoot, '.env'),
  path.join(backendRoot, '.env.production'),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();

const OFFICIAL_985_NAMES = [
  '北京大学',
  '清华大学',
  '中国人民大学',
  '北京航空航天大学',
  '北京理工大学',
  '中国农业大学',
  '北京师范大学',
  '中央民族大学',
  '南开大学',
  '天津大学',
  '大连理工大学',
  '东北大学',
  '吉林大学',
  '哈尔滨工业大学',
  '复旦大学',
  '同济大学',
  '上海交通大学',
  '华东师范大学',
  '南京大学',
  '东南大学',
  '浙江大学',
  '中国科学技术大学',
  '厦门大学',
  '山东大学',
  '中国海洋大学',
  '武汉大学',
  '华中科技大学',
  '湖南大学',
  '中南大学',
  '中山大学',
  '华南理工大学',
  '四川大学',
  '重庆大学',
  '电子科技大学',
  '西安交通大学',
  '西北工业大学',
  '西北农林科技大学',
  '兰州大学',
  '国防科技大学',
];

type CrawlOverride = {
  slug?: string;
  name?: string;
  priority?: string;
  website?: string;
  gradWebsite?: string;
  grad_website?: string;
  entryPoints?: string[];
  entry_points?: string[];
  strictEntryPoints?: boolean;
  strict_entry_points?: boolean;
};

type SiteCrawlRules = {
  listPagePatterns?: Array<{ host?: string; path?: string }>;
  detailAllowRules?: Array<{ host?: string; pathKeywords?: string[]; titleKeywords?: string[] }>;
  candidateAllowPatterns?: Record<string, string[]>;
  linkSelectors?: Record<string, string[]>;
  titleBlockKeywords?: Record<string, string[]>;
  blockedLinkPatterns?: Record<string, string[]>;
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

function hostOf(value?: string | null) {
  if (!value) return '';
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function asDateRange(year: number) {
  return {
    gte: new Date(year, 0, 1),
    lt: new Date(year + 1, 0, 1),
  };
}

function buildStatus(row: {
  inDb: boolean;
  hasOverride: boolean;
  entryPointCount: number;
  hasRecentCamp: boolean;
  hasRecentSummer: boolean;
  hasRecentPreRecommendation: boolean;
  hasCandidateRules: boolean;
  hasDetailAllowRules: boolean;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!row.inDb) blockers.push('missing_db_university');
  if (!row.hasOverride) blockers.push('missing_crawl_override');
  if (row.entryPointCount === 0) blockers.push('missing_entry_points');
  if (!row.hasCandidateRules && !row.hasDetailAllowRules) warnings.push('missing_site_rules');
  if (!row.hasRecentCamp) warnings.push('no_recent_db_camps');
  if (!row.hasRecentSummer) warnings.push('no_recent_summer_camp');
  if (!row.hasRecentPreRecommendation) warnings.push('no_recent_pre_recommendation');

  return {
    status: blockers.length > 0 ? 'blocker' : warnings.length > 0 ? 'needs_crawl' : 'ready',
    blockers,
    warnings,
  };
}

async function main() {
  const overrides = readJson<CrawlOverride[]>('shared/crawl-overrides.json');
  const siteRules = readJson<SiteCrawlRules>('shared/site-crawl-rules.json');
  const overrideByName = new Map(overrides.map((item) => [item.name, item]));
  const currentYear = new Date().getFullYear();
  const targetYears = [currentYear, currentYear - 1];
  const yearConditions = targetYears.map((year) => ({
    OR: [
      { publishDate: asDateRange(year) },
      { deadline: asDateRange(year) },
      { startDate: asDateRange(year) },
      { endDate: asDateRange(year) },
    ],
  }));

  const universities = await prisma.university.findMany({
    where: { name: { in: OFFICIAL_985_NAMES } },
    select: { id: true, name: true, region: true, level: true, priority: true, website: true },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
  });
  const universityByName = new Map(universities.map((item) => [item.name, item]));

  const rows = await Promise.all(
    OFFICIAL_985_NAMES.map(async (name) => {
      const university = universityByName.get(name);
      const override = overrideByName.get(name);
      const entryPoints = override?.entryPoints || override?.entry_points || [];
      const hosts = Array.from(
        new Set([
          hostOf(override?.gradWebsite || override?.grad_website),
          hostOf(override?.website),
          ...entryPoints.map(hostOf),
        ].filter(Boolean)),
      );
      const [recent, summer, preRecommendation] = university
        ? await Promise.all([
            prisma.campInfo.count({ where: { universityId: university.id, OR: yearConditions } }),
            prisma.campInfo.count({
              where: { universityId: university.id, announcementType: 'summer_camp', OR: yearConditions },
            }),
            prisma.campInfo.count({
              where: {
                universityId: university.id,
                announcementType: 'pre_recommendation',
                OR: yearConditions,
              },
            }),
          ])
        : [0, 0, 0];
      const listRuleCount = (siteRules.listPagePatterns || []).filter((rule) =>
        hosts.includes((rule.host || '').toLowerCase()),
      ).length;
      const detailAllowRuleCount = (siteRules.detailAllowRules || []).filter((rule) =>
        hosts.includes((rule.host || '').toLowerCase()),
      ).length;
      const candidateAllowRuleCount = hosts.reduce(
        (total, host) => total + ((siteRules.candidateAllowPatterns || {})[host]?.length || 0),
        0,
      );
      const linkSelectorCount = hosts.reduce(
        (total, host) => total + ((siteRules.linkSelectors || {})[host]?.length || 0),
        0,
      );
      const status = buildStatus({
        inDb: Boolean(university),
        hasOverride: Boolean(override),
        entryPointCount: entryPoints.length,
        hasRecentCamp: recent > 0,
        hasRecentSummer: summer > 0,
        hasRecentPreRecommendation: preRecommendation > 0,
        hasCandidateRules: candidateAllowRuleCount > 0,
        hasDetailAllowRules: detailAllowRuleCount > 0,
      });

      return {
        name,
        id: university?.id || '',
        region: university?.region || '',
        level: university?.level || '',
        priority: university?.priority || override?.priority || '',
        website: university?.website || override?.website || '',
        slug: override?.slug || '',
        gradWebsite: override?.gradWebsite || override?.grad_website || '',
        entryPointCount: entryPoints.length,
        hosts,
        listRuleCount,
        detailAllowRuleCount,
        candidateAllowRuleCount,
        linkSelectorCount,
        recent,
        summer,
        preRecommendation,
        ...status,
      };
    }),
  );

  const summary = {
    targetYears,
    expected985: OFFICIAL_985_NAMES.length,
    inDb: rows.filter((row) => row.id).length,
    withOverrides: rows.filter((row) => row.slug).length,
    withEntryPoints: rows.filter((row) => row.entryPointCount > 0).length,
    withSiteRules: rows.filter(
      (row) => row.candidateAllowRuleCount > 0 || row.detailAllowRuleCount > 0,
    ).length,
    ready: rows.filter((row) => row.status === 'ready').length,
    needsCrawl: rows.filter((row) => row.status === 'needs_crawl').length,
    blockers: rows.filter((row) => row.status === 'blocker').length,
    recentCovered: rows.filter((row) => row.recent > 0).length,
    summerCovered: rows.filter((row) => row.summer > 0).length,
    preRecommendationCovered: rows.filter((row) => row.preRecommendation > 0).length,
  };

  console.log(JSON.stringify({ summary, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
