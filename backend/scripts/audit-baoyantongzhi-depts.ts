/**
 * Audit script：拉 baoyantongzhi 全量公告，diff 出我们 DB 里缺失的 (学校, 院系) 对。
 *
 * 用法：
 *   cd backend && npx ts-node --transpile-only scripts/audit-baoyantongzhi-depts.ts > audit-report.txt
 *
 * 输出：
 *   - 控制台：精简 diff 报告
 *   - 文件 audit-missing-depts.json：完整 missing list（学校 + 院系 + 类型推断）
 */
/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const API = 'https://ajqwsiasyqyi.sealosgzg.site/backgd/notice/show/list';

interface Record {
  id: number;
  name: string;
  school: string;
  college: string;
  recruitType: string;
  universityLevel: string;
  year: number;
}

async function fetchAll(year: number, level: string): Promise<Record[]> {
  const all: Record[] = [];
  let current = 1;
  const size = 50;
  while (true) {
    const resp = await axios.get(API, {
      params: { current, size, orderBy: 'endTime', universityLevel: level, year },
      headers: {
        Referer: 'https://www.baoyantongzhi.com/',
        Origin: 'https://www.baoyantongzhi.com',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (audit)',
      },
      timeout: 15_000,
    });
    if (resp.data?.code !== 200) {
      console.error(`API error: ${resp.data?.msg}`);
      break;
    }
    const records = (resp.data?.data?.records || []) as Record[];
    all.push(...records);
    if (records.length < size) break;
    current++;
    if (current > 30) break;
  }
  return all;
}

function inferKind(name: string): string {
  if (/学院$/.test(name)) return 'school';
  if (/书院$/.test(name)) return 'academy';
  if (/实验室$/.test(name)) return 'lab';
  if (/中心$/.test(name)) return 'center';
  if (/研究院$/.test(name)) return 'institute';
  if (/系$/.test(name)) return 'department';
  return 'other';
}

function normalize(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[()（）·]/g, '').toLowerCase();
}

async function main() {
  console.log('===== baoyantongzhi 漏网院系 audit =====\n');

  // 1. 拉数据：985 + 211 + 双一流，2025 + 2026
  const yearsLevels: Array<[number, string]> = [
    [2026, '985'],
    [2026, '211'],
    [2026, '双一流'],
    [2025, '985'],
    [2025, '211'],
    [2025, '双一流'],
  ];
  const recordsByKey = new Map<string, Record>();
  for (const [year, level] of yearsLevels) {
    console.log(`拉取 ${year} ${level}...`);
    const recs = await fetchAll(year, level);
    for (const r of recs) {
      if (!r.school || !r.college) continue;
      const key = `${r.school}|${r.college}`;
      if (!recordsByKey.has(key)) recordsByKey.set(key, r);
    }
    console.log(`  +${recs.length} 条`);
  }

  // 去重后所有 (school, college) 对
  const pairs = Array.from(recordsByKey.entries());
  console.log(`\n去重后 (school, college) 对：${pairs.length}`);

  // 2. 拉我们 DB 里所有 (university.name, dept.name + shortName)
  const unis = await prisma.university.findMany({ select: { id: true, name: true } });
  const uniByName = new Map(unis.map((u) => [u.name, u.id]));

  const allDepts = await prisma.department.findMany({
    where: { active: true },
    select: { id: true, name: true, shortName: true, universityId: true },
  });
  const deptsByUni = new Map<string, Array<{ name: string; shortName: string | null }>>();
  for (const d of allDepts) {
    const arr = deptsByUni.get(d.universityId) || [];
    arr.push({ name: d.name, shortName: d.shortName });
    deptsByUni.set(d.universityId, arr);
  }
  console.log(`DB 内活跃院系总数：${allDepts.length}\n`);

  // 3. diff
  const missingBySchool = new Map<string, Set<string>>();
  const schoolNotFound = new Set<string>();

  for (const [key, rec] of pairs) {
    const universityId = uniByName.get(rec.school);
    if (!universityId) {
      schoolNotFound.add(rec.school);
      continue;
    }
    const depts = deptsByUni.get(universityId) || [];
    const normCollege = normalize(rec.college);
    const matched = depts.some((d) => {
      const n = normalize(d.name);
      const sn = d.shortName ? normalize(d.shortName) : '';
      return (
        n === normCollege ||
        sn === normCollege ||
        n.includes(normCollege) ||
        normCollege.includes(n) ||
        (sn && (sn.includes(normCollege) || normCollege.includes(sn)))
      );
    });
    if (!matched) {
      const set = missingBySchool.get(rec.school) || new Set();
      set.add(rec.college);
      missingBySchool.set(rec.school, set);
    }
  }

  // 4. 输出
  console.log('===== diff 结果 =====');
  console.log(`学校在我们 DB 内但院系缺失：${missingBySchool.size} 所学校`);
  console.log(`学校根本不在 DB（非 985/211/双一流？）：${schoolNotFound.size} 所\n`);

  const sortedSchools = Array.from(missingBySchool.keys()).sort();
  const missingTotal = Array.from(missingBySchool.values()).reduce((s, set) => s + set.size, 0);
  console.log(`缺失院系总条数：${missingTotal}\n`);

  console.log('--- 漏网详情（学校 / 缺失院系 / 推断类型） ---\n');
  const outputFlat: any[] = [];
  for (const school of sortedSchools) {
    const colleges = Array.from(missingBySchool.get(school)!).sort();
    console.log(`【${school}】(${colleges.length} 条)`);
    for (const c of colleges) {
      const kind = inferKind(c);
      console.log(`  - ${c.padEnd(30, ' ')}  [${kind}]`);
      outputFlat.push({ school, college: c, kind });
    }
    console.log('');
  }

  if (schoolNotFound.size > 0) {
    console.log('--- 学校根本不在 DB ---\n');
    for (const s of Array.from(schoolNotFound).sort()) {
      console.log(`  · ${s}`);
    }
    console.log('');
  }

  // 写 JSON
  const outFile = path.join(process.cwd(), 'audit-missing-depts.json');
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        summary: {
          totalPairs: pairs.length,
          missingTotal,
          missingSchools: missingBySchool.size,
          schoolsNotInDb: Array.from(schoolNotFound).sort(),
        },
        missing: outputFlat,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\n=> 完整 JSON 已写入 ${outFile}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
