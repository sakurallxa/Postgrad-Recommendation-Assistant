/**
 * v0.2 重构：把 shared/department-config.json 的 5 校×院系 配置导入 DB
 * 用法：
 *   cd backend && npx ts-node prisma/seed-departments.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface DeptConfigSchema {
  schools: Array<{
    id: string;
    name: string;
    shortName: string;
    logoUrl?: string;
    gradWebsite?: string;
    departments: Array<{
      id: string;
      name: string;
      shortName?: string;
      homepage?: string;
      noticeUrl?: string;
      majors: string[];
    }>;
  }>;
}

async function loadConfig(): Promise<DeptConfigSchema> {
  const cfgPath = path.resolve(__dirname, '../../shared/department-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf-8');
  return JSON.parse(raw) as DeptConfigSchema;
}

async function ensureUniversity(school: DeptConfigSchema['schools'][0]) {
  // 在 universities 表里找/建对应记录
  let university = await prisma.university.findFirst({
    where: { name: school.name },
  });
  if (!university) {
    university = await prisma.university.create({
      data: {
        name: school.name,
        logo: school.logoUrl,
        website: school.gradWebsite,
        level: '985',
        priority: 'P0',
      },
    });
    console.log(`  ✓ 新建 university: ${school.name}`);
  } else if (school.logoUrl && university.logo !== school.logoUrl) {
    university = await prisma.university.update({
      where: { id: university.id },
      data: { logo: school.logoUrl, priority: 'P0' },
    });
    console.log(`  ✓ 更新 university logo: ${school.name}`);
  }
  return university;
}

async function main() {
  console.log('===== v0.2 院系配置导入开始 =====');
  const config = await loadConfig();

  let totalDepts = 0;
  let newDepts = 0;
  let updatedDepts = 0;

  for (const school of config.schools) {
    console.log(`\n[${school.shortName || school.name}]`);
    const university = await ensureUniversity(school);

    for (const dept of school.departments) {
      totalDepts++;
      const existing = await prisma.department.findUnique({
        where: { id: dept.id },
      });
      const data = {
        schoolSlug: school.id,
        universityId: university.id,
        name: dept.name,
        shortName: dept.shortName || null,
        homepage: dept.homepage || null,
        noticeUrl: dept.noticeUrl || null,
        majors: JSON.stringify(dept.majors),
        active: true,
      };
      if (existing) {
        await prisma.department.update({
          where: { id: dept.id },
          data,
        });
        updatedDepts++;
        console.log(`  ↻ ${dept.name}`);
      } else {
        await prisma.department.create({
          data: { id: dept.id, ...data },
        });
        newDepts++;
        console.log(`  + ${dept.name}`);
      }
    }
  }

  console.log(`\n===== 完成 =====`);
  console.log(`总处理: ${totalDepts} 院系`);
  console.log(`新建: ${newDepts}`);
  console.log(`更新: ${updatedDepts}`);
}

main()
  .catch((err) => {
    console.error('Seed 失败:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
