"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const universities = [
    { name: '清华大学', region: '北京', level: '985', priority: 'P0', website: 'https://www.tsinghua.edu.cn' },
    { name: '北京大学', region: '北京', level: '985', priority: 'P0', website: 'https://www.pku.edu.cn' },
    { name: '复旦大学', region: '上海', level: '985', priority: 'P0', website: 'https://www.fudan.edu.cn' },
    { name: '上海交通大学', region: '上海', level: '985', priority: 'P0', website: 'https://www.sjtu.edu.cn' },
    { name: '浙江大学', region: '浙江', level: '985', priority: 'P0', website: 'https://www.zju.edu.cn' },
    { name: '中国科学技术大学', region: '安徽', level: '985', priority: 'P0', website: 'https://www.ustc.edu.cn' },
    { name: '南京大学', region: '江苏', level: '985', priority: 'P0', website: 'https://www.nju.edu.cn' },
    { name: '中国人民大学', region: '北京', level: '985', priority: 'P1', website: 'https://www.ruc.edu.cn' },
    { name: '北京航空航天大学', region: '北京', level: '985', priority: 'P1', website: 'https://www.buaa.edu.cn' },
    { name: '北京理工大学', region: '北京', level: '985', priority: 'P1', website: 'https://www.bit.edu.cn' },
    { name: '北京师范大学', region: '北京', level: '985', priority: 'P1', website: 'https://www.bnu.edu.cn' },
    { name: '南开大学', region: '天津', level: '985', priority: 'P1', website: 'https://www.nankai.edu.cn' },
    { name: '天津大学', region: '天津', level: '985', priority: 'P1', website: 'https://www.tju.edu.cn' },
    { name: '大连理工大学', region: '辽宁', level: '985', priority: 'P1', website: 'https://www.dlut.edu.cn' },
    { name: '吉林大学', region: '吉林', level: '985', priority: 'P1', website: 'https://www.jlu.edu.cn' },
    { name: '哈尔滨工业大学', region: '黑龙江', level: '985', priority: 'P1', website: 'https://www.hit.edu.cn' },
    { name: '同济大学', region: '上海', level: '985', priority: 'P1', website: 'https://www.tongji.edu.cn' },
    { name: '华东师范大学', region: '上海', level: '985', priority: 'P1', website: 'https://www.ecnu.edu.cn' },
    { name: '东南大学', region: '江苏', level: '985', priority: 'P1', website: 'https://www.seu.edu.cn' },
    { name: '厦门大学', region: '福建', level: '985', priority: 'P1', website: 'https://www.xmu.edu.cn' },
    { name: '山东大学', region: '山东', level: '985', priority: 'P1', website: 'https://www.sdu.edu.cn' },
    { name: '中国海洋大学', region: '山东', level: '985', priority: 'P1', website: 'https://www.ouc.edu.cn' },
    { name: '武汉大学', region: '湖北', level: '985', priority: 'P1', website: 'https://www.whu.edu.cn' },
    { name: '华中科技大学', region: '湖北', level: '985', priority: 'P1', website: 'https://www.hust.edu.cn' },
    { name: '湖南大学', region: '湖南', level: '985', priority: 'P1', website: 'https://www.hnu.edu.cn' },
    { name: '中南大学', region: '湖南', level: '985', priority: 'P1', website: 'https://www.csu.edu.cn' },
    { name: '中山大学', region: '广东', level: '985', priority: 'P1', website: 'https://www.sysu.edu.cn' },
    { name: '华南理工大学', region: '广东', level: '985', priority: 'P1', website: 'https://www.scut.edu.cn' },
    { name: '四川大学', region: '四川', level: '985', priority: 'P1', website: 'https://www.scu.edu.cn' },
    { name: '电子科技大学', region: '四川', level: '985', priority: 'P1', website: 'https://www.uestc.edu.cn' },
    { name: '重庆大学', region: '重庆', level: '985', priority: 'P1', website: 'https://www.cqu.edu.cn' },
    { name: '西安交通大学', region: '陕西', level: '985', priority: 'P1', website: 'https://www.xjtu.edu.cn' },
    { name: '西北工业大学', region: '陕西', level: '985', priority: 'P1', website: 'https://www.nwpu.edu.cn' },
    { name: '兰州大学', region: '甘肃', level: '985', priority: 'P1', website: 'https://www.lzu.edu.cn' },
    { name: '东北大学', region: '辽宁', level: '985', priority: 'P1', website: 'https://www.neu.edu.cn' },
    { name: '郑州大学', region: '河南', level: '985', priority: 'P1', website: 'https://www.zzu.edu.cn' },
    { name: '湖南师范大学', region: '湖南', level: '985', priority: 'P1', website: 'https://www.hunnu.edu.cn' },
    { name: '云南大学', region: '云南', level: '985', priority: 'P1', website: 'https://www.ynu.edu.cn' },
    { name: '西北农林科技大学', region: '陕西', level: '985', priority: 'P1', website: 'https://www.nwsuaf.edu.cn' },
    { name: '新疆大学', region: '新疆', level: '985', priority: 'P1', website: 'https://www.xju.edu.cn' },
    { name: '中央民族大学', region: '北京', level: '985', priority: 'P1', website: 'https://www.muc.edu.cn' },
    { name: '中国农业大学', region: '北京', level: '985', priority: 'P1', website: 'https://www.cau.edu.cn' },
    { name: '西北大学', region: '陕西', level: '985', priority: 'P1', website: 'https://www.nwu.edu.cn' },
    { name: '国防科技大学', region: '湖南', level: '985', priority: 'P1', website: 'https://www.nudt.edu.cn' },
    { name: '海军军医大学', region: '上海', level: '985', priority: 'P1', website: 'https://www.smmu.edu.cn' },
    { name: '空军军医大学', region: '陕西', level: '985', priority: 'P1', website: 'https://www.fmmu.edu.cn' },
    { name: '北京交通大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.bjtu.edu.cn' },
    { name: '北京工业大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.bjut.edu.cn' },
    { name: '北京科技大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.ustb.edu.cn' },
    { name: '北京化工大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.buct.edu.cn' },
    { name: '北京邮电大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.bupt.edu.cn' },
    { name: '北京林业大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.bjfu.edu.cn' },
    { name: '北京中医药大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.bucm.edu.cn' },
    { name: '北京外国语大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.bfsu.edu.cn' },
    { name: '中国传媒大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.cuc.edu.cn' },
    { name: '中央财经大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.cufe.edu.cn' },
    { name: '对外经济贸易大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.uibe.edu.cn' },
    { name: '中国政法大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.cupl.edu.cn' },
    { name: '华北电力大学', region: '北京', level: '211', priority: 'P2', website: 'https://www.ncepu.edu.cn' },
    { name: '中国矿业大学（北京）', region: '北京', level: '211', priority: 'P2', website: 'https://www.cumtb.edu.cn' },
    { name: '中国石油大学（北京）', region: '北京', level: '211', priority: 'P2', website: 'https://www.cup.edu.cn' },
    { name: '中国地质大学（北京）', region: '北京', level: '211', priority: 'P2', website: 'https://www.cugb.edu.cn' },
    { name: '天津医科大学', region: '天津', level: '211', priority: 'P2', website: 'https://www.tmu.edu.cn' },
    { name: '河北工业大学', region: '天津', level: '211', priority: 'P2', website: 'https://www.hebut.edu.cn' },
    { name: '太原理工大学', region: '山西', level: '211', priority: 'P2', website: 'https://www.tyut.edu.cn' },
    { name: '内蒙古大学', region: '内蒙古', level: '211', priority: 'P2', website: 'https://www.imu.edu.cn' },
    { name: '辽宁大学', region: '辽宁', level: '211', priority: 'P2', website: 'https://www.lnu.edu.cn' },
    { name: '大连海事大学', region: '辽宁', level: '211', priority: 'P2', website: 'https://www.dlmu.edu.cn' },
    { name: '延边大学', region: '吉林', level: '211', priority: 'P2', website: 'https://www.ybu.edu.cn' },
    { name: '东北师范大学', region: '吉林', level: '211', priority: 'P2', website: 'https://www.nenu.edu.cn' },
    { name: '哈尔滨工程大学', region: '黑龙江', level: '211', priority: 'P2', website: 'https://www.hrbeu.edu.cn' },
    { name: '东北农业大学', region: '黑龙江', level: '211', priority: 'P2', website: 'https://www.neau.edu.cn' },
    { name: '东北林业大学', region: '黑龙江', level: '211', priority: 'P2', website: 'https://www.nefu.edu.cn' },
    { name: '华东理工大学', region: '上海', level: '211', priority: 'P2', website: 'https://www.ecust.edu.cn' },
    { name: '东华大学', region: '上海', level: '211', priority: 'P2', website: 'https://www.dhu.edu.cn' },
    { name: '上海外国语大学', region: '上海', level: '211', priority: 'P2', website: 'https://www.shisu.edu.cn' },
    { name: '上海财经大学', region: '上海', level: '211', priority: 'P2', website: 'https://www.shufe.edu.cn' },
    { name: '上海大学', region: '上海', level: '211', priority: 'P2', website: 'https://www.shu.edu.cn' },
    { name: '海军军医大学', region: '上海', level: '211', priority: 'P2', website: 'https://www.smmu.edu.cn' },
    { name: '苏州大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.suda.edu.cn' },
    { name: '南京航空航天大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.nuaa.edu.cn' },
    { name: '南京理工大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.njust.edu.cn' },
    { name: '中国矿业大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.cumt.edu.cn' },
    { name: '南京邮电大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.njupt.edu.cn' },
    { name: '河海大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.hhu.edu.cn' },
    { name: '江南大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.jiangnan.edu.cn' },
    { name: '南京林业大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.njfu.edu.cn' },
    { name: '南京信息工程大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.nuist.edu.cn' },
    { name: '南京农业大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.njau.edu.cn' },
    { name: '南京中医药大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.njucm.edu.cn' },
    { name: '中国药科大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.cpu.edu.cn' },
    { name: '南京师范大学', region: '江苏', level: '211', priority: 'P2', website: 'https://www.njnu.edu.cn' },
    { name: '安徽大学', region: '安徽', level: '211', priority: 'P2', website: 'https://www.ahu.edu.cn' },
    { name: '合肥工业大学', region: '安徽', level: '211', priority: 'P2', website: 'https://www.hfut.edu.cn' },
    { name: '福州大学', region: '福建', level: '211', priority: 'P2', website: 'https://www.fzu.edu.cn' },
    { name: '南昌大学', region: '江西', level: '211', priority: 'P2', website: 'https://www.ncu.edu.cn' },
    { name: '中国石油大学（华东）', region: '山东', level: '211', priority: 'P2', website: 'https://www.upc.edu.cn' },
    { name: '郑州大学', region: '河南', level: '211', priority: 'P2', website: 'https://www.zzu.edu.cn' },
    { name: '中国地质大学（武汉）', region: '湖北', level: '211', priority: 'P2', website: 'https://www.cug.edu.cn' },
    { name: '武汉理工大学', region: '湖北', level: '211', priority: 'P2', website: 'https://www.whut.edu.cn' },
    { name: '华中农业大学', region: '湖北', level: '211', priority: 'P2', website: 'https://www.hzau.edu.cn' },
    { name: '华中师范大学', region: '湖北', level: '211', priority: 'P2', website: 'https://www.ccnu.edu.cn' },
    { name: '中南财经政法大学', region: '湖北', level: '211', priority: 'P2', website: 'https://www.zuel.edu.cn' },
    { name: '湖南师范大学', region: '湖南', level: '211', priority: 'P2', website: 'https://www.hunnu.edu.cn' },
    { name: '暨南大学', region: '广东', level: '211', priority: 'P2', website: 'https://www.jnu.edu.cn' },
    { name: '华南师范大学', region: '广东', level: '211', priority: 'P2', website: 'https://www.scnu.edu.cn' },
    { name: '广西大学', region: '广西', level: '211', priority: 'P2', website: 'https://www.gxu.edu.cn' },
    { name: '海南大学', region: '海南', level: '211', priority: 'P2', website: 'https://www.hainanu.edu.cn' },
    { name: '西南交通大学', region: '四川', level: '211', priority: 'P2', website: 'https://www.swjtu.edu.cn' },
    { name: '四川农业大学', region: '四川', level: '211', priority: 'P2', website: 'https://www.sicau.edu.cn' },
    { name: '西南大学', region: '重庆', level: '211', priority: 'P2', website: 'https://www.swu.edu.cn' },
    { name: '西南财经大学', region: '四川', level: '211', priority: 'P2', website: 'https://www.swufe.edu.cn' },
    { name: '贵州大学', region: '贵州', level: '211', priority: 'P2', website: 'https://www.gzu.edu.cn' },
    { name: '西藏大学', region: '西藏', level: '211', priority: 'P2', website: 'https://www.utibet.edu.cn' },
    { name: '云南大学', region: '云南', level: '211', priority: 'P2', website: 'https://www.ynu.edu.cn' },
    { name: '西北大学', region: '陕西', level: '211', priority: 'P2', website: 'https://www.nwu.edu.cn' },
    { name: '西安电子科技大学', region: '陕西', level: '211', priority: 'P2', website: 'https://www.xidian.edu.cn' },
    { name: '长安大学', region: '陕西', level: '211', priority: 'P2', website: 'https://www.chd.edu.cn' },
    { name: '陕西师范大学', region: '陕西', level: '211', priority: 'P2', website: 'https://www.snnu.edu.cn' },
    { name: '空军军医大学', region: '陕西', level: '211', priority: 'P2', website: 'https://www.fmmu.edu.cn' },
    { name: '青海大学', region: '青海', level: '211', priority: 'P2', website: 'https://www.qhu.edu.cn' },
    { name: '宁夏大学', region: '宁夏', level: '211', priority: 'P2', website: 'https://www.nxu.edu.cn' },
    { name: '新疆大学', region: '新疆', level: '211', priority: 'P2', website: 'https://www.xju.edu.cn' },
    { name: '石河子大学', region: '新疆', level: '211', priority: 'P2', website: 'https://www.shzu.edu.cn' },
    { name: '北京协和医学院', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.pumc.edu.cn' },
    { name: '首都师范大学', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.cnu.edu.cn' },
    { name: '外交学院', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.cfau.edu.cn' },
    { name: '中国人民公安大学', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.ppsuc.edu.cn' },
    { name: '中国科学院大学', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.ucas.edu.cn' },
    { name: '中央美术学院', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.cafa.edu.cn' },
    { name: '中央戏剧学院', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.chntheatre.edu.cn' },
    { name: '中国音乐学院', region: '北京', level: '双一流', priority: 'P3', website: 'https://www.ccmusic.edu.cn' },
    { name: '天津工业大学', region: '天津', level: '双一流', priority: 'P3', website: 'https://www.tiangong.edu.cn' },
    { name: '天津中医药大学', region: '天津', level: '双一流', priority: 'P3', website: 'https://www.tjutcm.edu.cn' },
    { name: '华北电力大学（保定）', region: '河北', level: '211', priority: 'P3', website: 'https://www.ncepu.edu.cn' },
    { name: '河北工业大学', region: '天津', level: '211', priority: 'P3', website: 'https://www.hebut.edu.cn' },
    { name: '山西大学', region: '山西', level: '双一流', priority: 'P3', website: 'https://www.sxu.edu.cn' },
];
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
    await prisma.campInfo.deleteMany();
    await prisma.major.deleteMany();
    await prisma.university.deleteMany();
    console.log('✅ 已清空现有数据');
    console.log(`📚 正在导入 ${universities.length} 所院校...`);
    for (const uni of universities) {
        await prisma.university.create({
            data: uni,
        });
    }
    console.log('✅ 院校数据导入完成');
    console.log(`📖 正在为院校导入专业数据...`);
    const allUniversities = await prisma.university.findMany();
    for (const uni of allUniversities) {
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
    console.log(`🏕️ 正在导入示例夏令营数据...`);
    const topUniversities = await prisma.university.findMany({
        where: { priority: { in: ['P0', 'P1'] } },
        take: 20,
    });
    const campTitles = [
        '2026年优秀大学生夏令营',
        '全国优秀大学生暑期学术夏令营',
        '研究生招生夏令营',
        '暑期学校暨夏令营',
        '优秀本科生夏令营',
    ];
    for (const uni of topUniversities) {
        const uniMajors = await prisma.major.findMany({
            where: { universityId: uni.id },
            take: 5,
        });
        for (const major of uniMajors) {
            const title = `${uni.name}${major.name}${campTitles[Math.floor(Math.random() * campTitles.length)]}`;
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + Math.floor(Math.random() * 60) + 30);
            await prisma.campInfo.create({
                data: {
                    title,
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
//# sourceMappingURL=seed.js.map