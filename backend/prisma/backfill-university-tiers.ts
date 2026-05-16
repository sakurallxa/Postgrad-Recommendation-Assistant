/**
 * 回填 University.is985 / is211 / isDoubleFirstClass。
 * 数据源：shared/university-tiers.json（教育部官方名单）
 *
 * 用法：
 *   cd backend && npx ts-node --transpile-only prisma/backfill-university-tiers.ts
 *
 * 行为：
 *   - 对 JSON 里每个 list 中的学校，按名字匹配 University 表
 *   - 设置对应的 boolean 为 true
 *   - 不在任何 list 里的学校保持 false（自动归"其他"）
 *   - 幂等：可重复跑
 */
/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('===== 回填 University 工程标记 =====\n');

  const jsonPath = path.resolve(__dirname, '../../shared/university-tiers.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`找不到 ${jsonPath}`);
  }
  const tiers = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
    is985: string[];
    is211: string[];
    isDoubleFirstClass: string[];
  };
  const set985 = new Set(tiers.is985);
  const set211 = new Set(tiers.is211);
  const setDFC = new Set(tiers.isDoubleFirstClass);
  console.log(`JSON 数量：is985=${set985.size} is211=${set211.size} isDFC=${setDFC.size}`);

  // 第一步：全部清零（防止之前手动标过的脏数据）
  await prisma.university.updateMany({
    data: { is985: false, is211: false, isDoubleFirstClass: false },
  });
  console.log('已清零所有 University 的 3 个标记');

  // 第二步：逐个 set 为 true
  const allUnis = await prisma.university.findMany({ select: { id: true, name: true } });
  let set985Count = 0;
  let set211Count = 0;
  let setDFCCount = 0;
  let unmatched985: string[] = [];
  let unmatched211: string[] = [];
  let unmatchedDFC: string[] = [];

  const dbNameSet = new Set(allUnis.map((u) => u.name));

  // 检查 JSON 里的学校是否都在 DB 中
  for (const name of set985) {
    if (!dbNameSet.has(name)) unmatched985.push(name);
  }
  for (const name of set211) {
    if (!dbNameSet.has(name)) unmatched211.push(name);
  }
  for (const name of setDFC) {
    if (!dbNameSet.has(name)) unmatchedDFC.push(name);
  }
  if (unmatched985.length || unmatched211.length || unmatchedDFC.length) {
    console.warn(`\n⚠️  以下学校在 JSON 中但 DB 没有：`);
    if (unmatched985.length) console.warn(`  is985 缺：${unmatched985.join(', ')}`);
    if (unmatched211.length) console.warn(`  is211 缺：${unmatched211.join(', ')}`);
    if (unmatchedDFC.length) console.warn(`  isDFC 缺：${unmatchedDFC.join(', ')}`);
    console.warn(`（建议先把这些学校加到 universities.ts seed 再回跑）\n`);
  }

  // 更新
  for (const u of allUnis) {
    const data: any = {};
    if (set985.has(u.name)) {
      data.is985 = true;
      set985Count++;
    }
    if (set211.has(u.name)) {
      data.is211 = true;
      set211Count++;
    }
    if (setDFC.has(u.name)) {
      data.isDoubleFirstClass = true;
      setDFCCount++;
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.university.update({ where: { id: u.id }, data });
  }

  console.log(`\n=== 更新结果 ===`);
  console.log(`  is985 标记数：${set985Count} (JSON 期望 ${set985.size})`);
  console.log(`  is211 标记数：${set211Count} (JSON 期望 ${set211.size})`);
  console.log(`  isDFC 标记数：${setDFCCount} (JSON 期望 ${setDFC.size})`);

  // 验证：DB 里其他学校（未命中任何 tier）
  const inOther = await prisma.university.count({
    where: {
      AND: [{ is985: false }, { is211: false }, { isDoubleFirstClass: false }],
    },
  });
  console.log(`  归"其他"的学校：${inOther}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
