import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const backendRoot = path.resolve(__dirname, '..');
for (const envPath of [
  path.join(backendRoot, '.env'),
  path.join(backendRoot, '.env.production'),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();

const OFFICIAL_985_NAMES = new Set([
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
]);

function asDateRange(year: number) {
  return {
    gte: new Date(year, 0, 1),
    lt: new Date(year + 1, 0, 1),
  };
}

async function main() {
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
    where: { name: { in: Array.from(OFFICIAL_985_NAMES) } },
    select: {
      id: true,
      name: true,
      level: true,
      priority: true,
      _count: { select: { campInfos: true } },
    },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
  });

  const rows = await Promise.all(
    universities.map(async (university) => {
      const [summer, preRecommendation, recent] = await Promise.all([
        prisma.campInfo.count({
          where: {
            universityId: university.id,
            announcementType: 'summer_camp',
            OR: yearConditions,
          },
        }),
        prisma.campInfo.count({
          where: {
            universityId: university.id,
            announcementType: 'pre_recommendation',
            OR: yearConditions,
          },
        }),
        prisma.campInfo.count({
          where: {
            universityId: university.id,
            OR: yearConditions,
          },
        }),
      ]);
      return {
        name: university.name,
        level: university.level,
        priority: university.priority,
        total: university._count.campInfos,
        recent,
        summer,
        preRecommendation,
        status: recent > 0 ? 'covered' : 'missing',
      };
    }),
  );

  const namesInDb = new Set(universities.map((item) => item.name));
  const missingUniversities = Array.from(OFFICIAL_985_NAMES).filter((name) => !namesInDb.has(name));
  const mislabeled = await prisma.university.findMany({
    where: {
      level: '985',
      name: { notIn: Array.from(OFFICIAL_985_NAMES) },
    },
    select: { name: true, level: true, priority: true },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
  });

  const summary = {
    expected985: OFFICIAL_985_NAMES.size,
    inDb: universities.length,
    missingUniversities,
    mislabeled985: mislabeled,
    coveredRecent985: rows.filter((row) => row.status === 'covered').length,
    missingRecent985: rows.filter((row) => row.status === 'missing').length,
    targetYears,
    rows,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
