/**
 * 回填 University.gradWebsite —— 把每所 985 院校的"研究生院/招生考试网"地址写入 DB。
 * 这些 URL 是保研公告"跨域发布"的主要载体（比如上海交大集成电路学院的公告
 * 其实是发在 yzb.sjtu.edu.cn 而不是 ice.sjtu.edu.cn），spider 必须覆盖到。
 *
 * 用法：
 *   cd backend && npx ts-node --transpile-only prisma/backfill-grad-websites.ts
 *
 * 幂等：可重复跑，命中即 update，没命中的学校跳过 + 打日志。
 */
/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 985 院校研究生院 / 招生考试网 URL 映射。
 * 注：这里是 best-effort 手动维护，遇到新学校请追加。
 *   key   = University.name 全称（必须与 DB 一致）
 *   value = 中央招生站点根 URL
 */
const GRAD_WEBSITES: Record<string, string> = {
  // 综合 + 工科顶尖
  清华大学: 'https://yz.tsinghua.edu.cn',
  北京大学: 'https://admission.pku.edu.cn',
  复旦大学: 'https://gsao.fudan.edu.cn',
  上海交通大学: 'https://yzb.sjtu.edu.cn',
  浙江大学: 'http://www.grs.zju.edu.cn',
  中国科学技术大学: 'http://yz.ustc.edu.cn',
  南京大学: 'https://grawww.nju.edu.cn',
  中国人民大学: 'https://pgs.ruc.edu.cn',

  // 顶尖理工
  哈尔滨工业大学: 'http://yzb.hit.edu.cn',
  西安交通大学: 'http://yz.xjtu.edu.cn',
  北京航空航天大学: 'https://yzb.buaa.edu.cn',
  北京理工大学: 'https://yzb.bit.edu.cn',
  华中科技大学: 'http://gszs.hust.edu.cn',
  东南大学: 'https://yzb.seu.edu.cn',
  同济大学: 'https://yz.tongji.edu.cn',
  天津大学: 'http://yzb.tju.edu.cn',
  大连理工大学: 'http://gs.dlut.edu.cn',
  电子科技大学: 'https://yz.uestc.edu.cn',

  // 综合
  武汉大学: 'http://www.gs.whu.edu.cn',
  四川大学: 'https://gs.scu.edu.cn',
  山东大学: 'http://www.yz.sdu.edu.cn',
  中山大学: 'https://graduate.sysu.edu.cn',
  厦门大学: 'https://zsb.xmu.edu.cn',
  南开大学: 'https://yzb.nankai.edu.cn',
  吉林大学: 'http://gs.jlu.edu.cn',
  中南大学: 'http://gra.csu.edu.cn',
  湖南大学: 'http://gradschool.hnu.edu.cn',
  重庆大学: 'http://gs.cqu.edu.cn',

  // 农林医
  中国农业大学: 'http://yz.cau.edu.cn',
  华南理工大学: 'https://gzs.scut.edu.cn',
  兰州大学: 'http://ge.lzu.edu.cn',
  东北大学: 'http://www.grs.neu.edu.cn',
  西北工业大学: 'https://yzb.nwpu.edu.cn',
  西北农林科技大学: 'https://yz.nwsuaf.edu.cn',
  中央民族大学: 'https://gs.muc.edu.cn',

  // 师范
  北京师范大学: 'https://yz.bnu.edu.cn',
  华东师范大学: 'http://yjsy.ecnu.edu.cn',

  // 国防
  国防科技大学: 'https://www.nudt.edu.cn',

  // 分校区（v0.4 新增）
  '哈尔滨工业大学（威海）': 'http://yzb.hitwh.edu.cn',
  '哈尔滨工业大学（深圳）': 'https://yzb.hitsz.edu.cn',

  // 非 985 但纳入推免体系（v0.4 新增）
  上海科技大学: 'https://gradschool.shanghaitech.edu.cn',
  上海财经大学: 'https://yz.sufe.edu.cn',
  中国科学院大学: 'https://admission.ucas.ac.cn',
  北京协和医学院: 'https://yz.pumc.edu.cn',
  南方科技大学: 'https://gs.sustech.edu.cn',
  暨南大学: 'https://yz.jnu.edu.cn',
};

async function main() {
  console.log('===== 回填 University.gradWebsite =====\n');
  let updated = 0;
  let missing = 0;
  for (const [name, url] of Object.entries(GRAD_WEBSITES)) {
    const uni = await prisma.university.findFirst({ where: { name }, select: { id: true, gradWebsite: true } });
    if (!uni) {
      console.warn(`  ⚠️  跳过 ${name}（universities 表里找不到）`);
      missing++;
      continue;
    }
    if (uni.gradWebsite === url) {
      console.log(`  · ${name}: 已是最新（${url}）`);
      continue;
    }
    await prisma.university.update({ where: { id: uni.id }, data: { gradWebsite: url } });
    console.log(`  ✓ ${name}: ${url}`);
    updated++;
  }
  console.log(`\n完成: 更新 ${updated} 条，缺失 ${missing} 条`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
