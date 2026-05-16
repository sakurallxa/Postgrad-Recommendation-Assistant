/**
 * 回填 University.logo —— 给每所大学填一个可公开访问的校徽 URL。
 *
 * 用法：
 *   1. 在下方 LOGO_URLS map 里按学校全名补 URL（你可以使用 urongda 等正版资源源）
 *   2. cd backend && npx ts-node --transpile-only prisma/backfill-university-logos.ts
 *
 * 关键约束：
 *   - 这里只存 URL，不存图片二进制；URL 必须是 https 才能被小程序 <image src> 加载
 *   - URL 来源由你保证合规（建议用学校官网公开的 logo URL 或商业图源）
 *   - 小程序加载失败会自动降级为"首字母圆形 placeholder"，不影响功能
 *
 * 注意：URL 一旦失效（图源更换 / 防盗链），前端会自动 fallback；
 *       建议把 logo URL 改成你自己 CDN 托管的稳定 URL，长期更可靠。
 */
/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * key = University.name（必须与 DB 完全一致）
 * value = https URL 指向 SVG 或 PNG 校徽
 *
 * 把你拿到的 URL 一个一个填进来。空字符串或 null 跳过。
 */
const LOGO_URLS: Record<string, string> = {
  // 985 (示例，由你填实际 URL)
  清华大学: '',
  北京大学: '',
  复旦大学: '',
  上海交通大学: '',
  浙江大学: '',
  中国科学技术大学: '',
  南京大学: '',
  中国人民大学: '',
  哈尔滨工业大学: '',
  西安交通大学: '',
  北京航空航天大学: '',
  北京理工大学: '',
  华中科技大学: '',
  东南大学: '',
  同济大学: '',
  天津大学: '',
  大连理工大学: '',
  电子科技大学: '',
  武汉大学: '',
  四川大学: '',
  山东大学: '',
  中山大学: '',
  厦门大学: '',
  南开大学: '',
  吉林大学: '',
  中南大学: '',
  湖南大学: '',
  重庆大学: '',
  中国农业大学: '',
  华南理工大学: '',
  兰州大学: '',
  东北大学: '',
  西北工业大学: '',
  西北农林科技大学: '',
  中央民族大学: '',
  北京师范大学: '',
  华东师范大学: '',
  国防科技大学: '',

  // 分校区
  '哈尔滨工业大学（威海）': '',
  '哈尔滨工业大学（深圳）': '',
  '山东大学（威海）': '',
  '中国科学院': '',

  // 211 / 双一流 / 医学院
  上海科技大学: '',
  上海财经大学: '',
  中国科学院大学: '',
  北京协和医学院: '',
  南方科技大学: '',
  广州医科大学: '',
  暨南大学: '',
};

async function main() {
  console.log('===== 回填 University.logo =====\n');
  let updated = 0;
  let skippedEmpty = 0;
  let missing = 0;
  for (const [name, url] of Object.entries(LOGO_URLS)) {
    if (!url || !url.trim()) {
      skippedEmpty++;
      continue;
    }
    const uni = await prisma.university.findFirst({
      where: { name },
      select: { id: true, logo: true },
    });
    if (!uni) {
      console.warn(`  ⚠️  跳过 ${name}（universities 表里找不到）`);
      missing++;
      continue;
    }
    if (uni.logo === url) {
      console.log(`  · ${name}: 已是最新`);
      continue;
    }
    await prisma.university.update({ where: { id: uni.id }, data: { logo: url } });
    console.log(`  ✓ ${name}`);
    updated++;
  }
  console.log(`\n完成: 更新 ${updated} 条，空白跳过 ${skippedEmpty} 条，缺失 ${missing} 条`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
