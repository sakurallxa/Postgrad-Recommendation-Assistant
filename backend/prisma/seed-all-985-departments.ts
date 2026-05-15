/**
 * v0.2 补充：给所有 39 所 985（除已详细配置的 5 校外）补一个"研究生院"默认院系
 * 这样用户可以从全部 985 中自由选择订阅
 * 用法: npx ts-node prisma/seed-all-985-departments.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 5 校已有详细院系配置，跳过
const DETAILED_SCHOOLS = new Set([
  '北京大学', '上海交通大学', '复旦大学', '中国科学技术大学', '中国人民大学',
]);

// 通用专业（接近所有研究生院都覆盖）
const COMMON_MAJORS = [
  '计算机科学与技术', '电子信息工程', '通信工程', '软件工程', '人工智能',
  '机械工程', '材料科学与工程', '化学', '物理学', '数学与应用数学',
  '生物科学', '经济学', '金融学', '工商管理', '法学', '新闻学',
];

async function main() {
  console.log('===== 补充全 985 默认院系 =====');
  const universities = await prisma.university.findMany({
    where: { level: '985' },
  });
  console.log(`找到 ${universities.length} 所 985`);

  let added = 0;
  let skipped = 0;

  for (const univ of universities) {
    const isDetailed = DETAILED_SCHOOLS.has(univ.name);

    // 检查是否已有 Department
    const existingDepts = await prisma.department.count({
      where: { universityId: univ.id },
    });

    if (existingDepts > 0) {
      // 已经有详细院系或之前已添加默认院系，跳过
      console.log(`  ↺ ${univ.name}: 已有 ${existingDepts} 院系`);
      skipped++;
      continue;
    }

    // 没有 → 添加一个"研究生院"默认 dept
    const defaultDeptId = `${univ.id}-grad-default`;
    await prisma.department.create({
      data: {
        id: defaultDeptId,
        schoolSlug: univ.id, // 使用 universityId 作为 slug 兜底
        universityId: univ.id,
        name: '研究生院（整体公告）',
        shortName: '研究生院',
        homepage: univ.website || null,
        noticeUrl: null,
        majors: JSON.stringify(COMMON_MAJORS),
        active: true,
      },
    });
    console.log(`  + ${univ.name} 默认院系`);
    added++;
  }

  console.log(`\n===== 完成 =====`);
  console.log(`新建默认院系: ${added}`);
  console.log(`跳过（已有）: ${skipped}`);
}

main()
  .catch((err) => {
    console.error('Seed 失败:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
