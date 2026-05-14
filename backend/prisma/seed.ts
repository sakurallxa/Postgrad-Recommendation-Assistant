import { PrismaClient } from '@prisma/client';
import { universities } from './data/universities';

const prisma = new PrismaClient();

/**
 * 专业种子数据
 */
const majors = [
  { name: '计算机科学与技术', category: '工学' },
  { name: '软件工程', category: '工学' },
  { name: '电子信息工程', category: '工学' },
  { name: '通信工程', category: '工学' },
  { name: '机械工程', category: '工学' },
  { name: '土木工程', category: '工学' },
  { name: '建筑学', category: '工学' },
  { name: '化学工程与技术', category: '工学' },
  { name: '材料科学与工程', category: '工学' },
  { name: '电气工程', category: '工学' },
  { name: '控制科学与工程', category: '工学' },
  { name: '数学', category: '理学' },
  { name: '物理学', category: '理学' },
  { name: '化学', category: '理学' },
  { name: '生物学', category: '理学' },
  { name: '统计学', category: '理学' },
  { name: '应用经济学', category: '经济学' },
  { name: '理论经济学', category: '经济学' },
  { name: '工商管理', category: '管理学' },
  { name: '管理科学与工程', category: '管理学' },
  { name: '公共管理', category: '管理学' },
  { name: '法学', category: '法学' },
  { name: '政治学', category: '法学' },
  { name: '社会学', category: '法学' },
  { name: '马克思主义理论', category: '法学' },
  { name: '中国语言文学', category: '文学' },
  { name: '外国语言文学', category: '文学' },
  { name: '新闻传播学', category: '文学' },
  { name: '历史学', category: '历史学' },
  { name: '哲学', category: '哲学' },
  { name: '教育学', category: '教育学' },
  { name: '心理学', category: '教育学' },
  { name: '体育学', category: '教育学' },
  { name: '艺术学理论', category: '艺术学' },
  { name: '音乐与舞蹈学', category: '艺术学' },
  { name: '戏剧与影视学', category: '艺术学' },
  { name: '美术学', category: '艺术学' },
  { name: '设计学', category: '艺术学' },
  { name: '临床医学', category: '医学' },
  { name: '基础医学', category: '医学' },
  { name: '药学', category: '医学' },
  { name: '中医学', category: '医学' },
  { name: '中西医结合', category: '医学' },
  { name: '护理学', category: '医学' },
  { name: '公共卫生与预防医学', category: '医学' },
  { name: '口腔医学', category: '医学' },
  { name: '农林经济管理', category: '管理学' },
  { name: '作物学', category: '农学' },
  { name: '园艺学', category: '农学' },
  { name: '农业资源与环境', category: '农学' },
  { name: '植物保护', category: '农学' },
  { name: '畜牧学', category: '农学' },
  { name: '兽医学', category: '农学' },
  { name: '林学', category: '农学' },
  { name: '水产', category: '农学' },
  { name: '草学', category: '农学' },
];

async function main() {
  console.log('🌱 开始导入种子数据...');

  // 清空现有数据
  await prisma.campInfo.deleteMany();
  await prisma.major.deleteMany();
  await prisma.university.deleteMany();
  console.log('✅ 已清空现有数据');

  // 导入院校数据
  console.log(`📚 正在导入 ${universities.length} 所院校...`);
  for (const uni of universities) {
    await prisma.university.create({
      data: uni,
    });
  }
  console.log('✅ 院校数据导入完成');

  // 为每所院校导入专业数据
  console.log(`📖 正在为院校导入专业数据...`);
  const allUniversities = await prisma.university.findMany();
  
  for (const uni of allUniversities) {
    // 随机选择10-20个专业
    const numMajors = Math.floor(Math.random() * 10) + 10;
    const shuffled = [...majors].sort(() => 0.5 - Math.random());
    const selectedMajors = shuffled.slice(0, numMajors);
    
    for (const major of selectedMajors) {
      await prisma.major.create({
        data: {
          ...major,
          universityId: uni.id,
        },
      });
    }
  }
  console.log('✅ 专业数据导入完成');

  // 导入示例夏令营数据
  console.log(`🏕️ 正在导入示例夏令营数据...`);
  const topUniversities = await prisma.university.findMany({
    where: { priority: { in: ['P0', 'P1'] } },
    take: 20,
  });

  const campTitles = [
    { suffix: '2026年优秀大学生夏令营', type: 'summer_camp' },
    { suffix: '全国优秀大学生暑期学术夏令营', type: 'summer_camp' },
    { suffix: '研究生招生夏令营', type: 'summer_camp' },
    { suffix: '暑期学校暨夏令营', type: 'summer_camp' },
    { suffix: '优秀本科生夏令营', type: 'summer_camp' },
    { suffix: '2026年预推免招生通知', type: 'pre_recommendation' },
    { suffix: '推荐免试研究生接收工作办法', type: 'pre_recommendation' },
  ];

  for (const uni of topUniversities) {
    const uniMajors = await prisma.major.findMany({
      where: { universityId: uni.id },
      take: 5,
    });

    for (const major of uniMajors) {
      const selectedCampTitle = campTitles[Math.floor(Math.random() * campTitles.length)];
      const title = `${uni.name}${major.name}${selectedCampTitle.suffix}`;
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + Math.floor(Math.random() * 60) + 30);

      await prisma.campInfo.create({
        data: {
          title,
          announcementType: selectedCampTitle.type,
          sourceUrl: `${uni.website}/admission`,
          universityId: uni.id,
          majorId: major.id,
          publishDate: new Date(),
          deadline,
          status: 'published',
          confidence: 0.95,
          requirements: JSON.stringify({
            grade: '本科前5学期成绩排名前30%',
            english: 'CET-6 425分以上',
            major: major.name,
          }),
          materials: JSON.stringify([
            '申请表',
            '个人陈述',
            '成绩单',
            '获奖证书',
            '推荐信',
          ]),
          process: JSON.stringify([
            '网上报名',
            '材料审核',
            '入营通知',
            '夏令营活动',
            '优秀营员评选',
          ]),
        },
      });
    }
  }
  console.log('✅ 夏令营数据导入完成');

  console.log('🎉 所有种子数据导入完成！');
  console.log(`📊 统计信息:`);
  console.log(`   - 院校: ${await prisma.university.count()} 所`);
  console.log(`   - 专业: ${await prisma.major.count()} 个`);
  console.log(`   - 夏令营: ${await prisma.campInfo.count()} 条`);
}

main()
  .catch((e) => {
    console.error('❌ 种子数据导入失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
