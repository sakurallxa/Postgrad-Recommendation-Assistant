/**
 * 从 shared/university-departments.json (39 所 985 × 1147 院系) 回填 Department 表。
 *
 * 用法:
 *   cd backend && npx ts-node prisma/seed-from-university-departments.ts
 *
 * 行为:
 * 1) 删除所有 "*-grad-default" 占位条目（之前补的"研究生院整体公告"）
 * 2) 对 shared/university-departments.json 里每所学校 × 每个院系：
 *    - 用 stable id = `${slug}-d${index}` 标识
 *    - 关联到 universities 表（按 name 精准匹配）
 *    - 跳过已存在的 id（保留之前 5 校的详细数据）
 *
 * 幂等：可重复运行，不会重复建条目。
 */
/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

interface DeptEntry {
  name: string;
  shortName?: string;
  website?: string;
  kind?: string;
  majors?: string[];
  majorCategories?: string[];
  entryPoints?: string[];
}
interface UniEntry {
  slug: string;
  name: string;
  departments: DeptEntry[];
}

function makeDeptId(slug: string, deptName: string): string {
  // 用 schoolSlug + 院系名 hash 前 6 位，保证稳定 + 唯一
  const h = createHash('md5').update(deptName).digest('hex').slice(0, 6);
  return `${slug}-${h}`;
}

async function main() {
  console.log('===== 从 university-departments.json 回填 Department 表 =====\n');

  // 1. 加载源数据
  const jsonPath = path.resolve(__dirname, '../../shared/university-departments.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`找不到 ${jsonPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const unis: UniEntry[] = payload.universities || [];
  console.log(`源数据: ${unis.length} 所学校，共 ${unis.reduce((s, u) => s + u.departments.length, 0)} 个院系`);

  // 2. 先删占位"研究生院（整体公告）"
  const placeholderDeleted = await prisma.department.deleteMany({
    where: {
      OR: [
        { id: { endsWith: '-grad-default' } },
        { name: '研究生院（整体公告）' },
      ],
    },
  });
  console.log(`已清理占位条目: ${placeholderDeleted.count} 个\n`);

  // 3. 写入
  let created = 0;
  let updated = 0;
  let skippedNoUni = 0;

  for (const u of unis) {
    const university = await prisma.university.findFirst({
      where: { name: u.name },
      select: { id: true },
    });
    if (!university) {
      console.warn(`  ⚠️  跳过 ${u.name}（universities 表里找不到对应记录）`);
      skippedNoUni += u.departments.length;
      continue;
    }

    for (const d of u.departments) {
      const id = makeDeptId(u.slug, d.name);
      const data = {
        schoolSlug: u.slug,
        universityId: university.id,
        name: d.name,
        shortName: d.shortName || null,
        homepage: d.website || null,
        noticeUrl: d.entryPoints && d.entryPoints.length ? d.entryPoints[0] : null,
        majors: JSON.stringify(d.majors || []),
        active: true,
      };

      const existing = await prisma.department.findUnique({ where: { id } });
      if (existing) {
        await prisma.department.update({ where: { id }, data });
        updated++;
      } else {
        await prisma.department.create({ data: { id, ...data } });
        created++;
      }
    }
    console.log(`  ✓ ${u.name}: ${u.departments.length} 院系`);
  }

  console.log(`\n===== 完成 =====`);
  console.log(`新建: ${created}`);
  console.log(`更新: ${updated}`);
  console.log(`跳过（无对应大学）: ${skippedNoUni}`);

  // 4. 汇总
  const finalCount = await prisma.department.count();
  console.log(`\nDepartment 表总数: ${finalCount}`);
}

main()
  .catch((err) => {
    console.error('失败:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
