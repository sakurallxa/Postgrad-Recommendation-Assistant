import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlerService } from './crawler.service';
import { MatchSchedulerSingleton } from '../crawl-job/match-scheduler';

/**
 * 镜像数据源：baoyantongzhi.com（保研通知网）
 *
 * 关键改造（解决"用户订阅了浙大数学院却看不到公告"的问题）：
 * 1) 把 record.school + record.college 解析成我们 DB 的 (universityId, departmentId)
 * 2) ingest 完后立即调 MatchSchedulerSingleton.scheduleMatching(deptId, campIds)
 *    复用 spider 链路里的 LLM 匹配逻辑 → 写入 CampMatchResult → 用户能看到
 */
@Injectable()
export class BaoyantongzhiMirrorService {
  private readonly logger = new Logger(BaoyantongzhiMirrorService.name);
  private readonly API_BASE = 'https://ajqwsiasyqyi.sealosgzg.site';
  private readonly LIST_PATH = '/backgd/notice/show/list';

  // 临时 in-memory cache：universityId -> Map<normalizedDeptName, deptId>
  private deptCacheByUni: Map<string, Map<string, string>> = new Map();

  // 同步健康监控：连续失败计数 + 最近一次结果
  private consecutiveFailures = 0;
  private lastSyncAt: Date | null = null;
  private lastSyncOk = true;
  private lastError: string | null = null;
  private lastFetchedCount = 0;
  private syncHistory: Array<{ at: Date; ok: boolean; scope: string; count: number; error: string | null }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly crawlerService: CrawlerService,
  ) {}

  // 每 30 分钟全量同步主数据流
  // scope: 985 / 211 / 双一流，当前年 + 上一年（防止跨年遗漏正在招生中的公告）
  @Cron('0 */30 * * * *')
  async syncLatest() {
    const enabled = this.configService.get<string>('BAOYANTONGZHI_MIRROR_ENABLED');
    if (enabled === 'false' || enabled === '0') return;
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    const levels = ['985', '211', '双一流'];
    let totalFetched = 0;
    let totalErrors = 0;
    for (const year of [thisYear, lastYear]) {
      for (const level of levels) {
        try {
          const records = await this.fetchPage(1, 50, year, level);
          if (records.length) {
            await this.ingestRecords(records, `baoyantongzhi-${level}-${year}-cron`);
            totalFetched += records.length;
          }
          this.recordSyncOutcome(true, null, records.length, `${level}/${year}`);
        } catch (e: any) {
          totalErrors++;
          this.logger.warn(`syncLatest(${level}/${year}) 失败: ${e?.message}`);
          this.recordSyncOutcome(false, e?.message || 'unknown', 0, `${level}/${year}`);
        }
      }
    }
    this.logger.log(
      `[mirror] syncLatest done: fetched=${totalFetched} errors=${totalErrors}/${levels.length * 2}`,
    );
  }

  /**
   * 一次性：从 baoyantongzhi 全量数据建立 (school, college) → Department 表映射。
   * 用于补齐 211 / 双一流 / 中科院体系学校的院系列表（这些之前 audit 没批量补到 seed JSON）。
   *
   * 流程：
   *   1) 跨 2026/2025 + 985/211/双一流 拉所有 records
   *   2) 抽 distinct (school, college)，跳过 "全校类"
   *   3) 对每对：找 University，若该校已有 dept 共用现有 schoolSlug；否则生成 uni-<8> slug
   *   4) Upsert Department：id = `<slug>-<md5(college)首6>`
   */
  async backfillDeptsFromMirror(): Promise<{
    scannedPairs: number;
    created: number;
    skippedExisting: number;
    skippedNoUni: number;
    universities: number;
    overallPlaceholders?: { created: number; alreadyOk: number };
  }> {
    // 1) 拉全量 records
    const allRecords: any[] = [];
    for (const year of [2026, 2025]) {
      for (const level of ['985', '211', '双一流']) {
        let current = 1;
        const size = 50;
        while (true) {
          const recs = await this.fetchPage(current, size, year, level).catch(() => [] as any[]);
          if (!recs.length) break;
          allRecords.push(...recs);
          if (recs.length < size) break;
          current++;
          if (current > 30) break;
        }
      }
    }

    // 2) 整理 distinct (school, college)
    const pairs = new Map<string, { school: string; college: string; rec: any }>();
    for (const r of allRecords) {
      if (!r.school || !r.college || r.college === '全校类') continue;
      const key = `${r.school}|${r.college}`;
      if (!pairs.has(key)) {
        pairs.set(key, { school: r.school, college: r.college, rec: r });
      }
    }
    this.logger.log(`[dept-backfill] 从 ${allRecords.length} 条记录抽出 ${pairs.size} 对 (school, college)`);

    // 3) 拉所有 university + 它们已有的第一个 dept（拿 schoolSlug）
    const universities = await this.prisma.university.findMany({
      where: { level: { in: ['985', '211', '双一流', '中科院'] } },
      include: {
        departments: {
          where: { active: true },
          select: { schoolSlug: true },
          take: 1,
        },
      },
    });
    const uniMeta = new Map<string, { id: string; slug: string }>();
    for (const u of universities) {
      const slug = u.departments[0]?.schoolSlug || `uni-${u.id.slice(0, 8)}`;
      uniMeta.set(u.name, { id: u.id, slug });
    }

    // 4) 对每对 upsert Department
    const crypto = require('crypto');
    let created = 0;
    let skippedExisting = 0;
    let skippedNoUni = 0;
    const touchedUniNames = new Set<string>();

    for (const { school, college, rec } of pairs.values()) {
      const uni = uniMeta.get(school);
      if (!uni) {
        skippedNoUni++;
        continue;
      }
      const h = crypto.createHash('md5').update(college).digest('hex').slice(0, 6);
      const deptId = `${uni.slug}-${h}`;
      const existing = await this.prisma.department.findUnique({ where: { id: deptId } });
      if (existing) {
        skippedExisting++;
        continue;
      }
      const kind = this.inferDeptKind(college);
      const shortName = this.makeShortName(college);
      try {
        await this.prisma.department.create({
          data: {
            id: deptId,
            schoolSlug: uni.slug,
            universityId: uni.id,
            name: college,
            shortName,
            homepage: null,
            noticeUrl: null,
            majors: JSON.stringify(rec.majorType ? [rec.majorType] : []),
            active: true,
          },
        });
        created++;
        touchedUniNames.add(school);
      } catch (e: any) {
        this.logger.warn(`[dept-backfill] 创建失败 ${school}/${college}: ${e?.message}`);
      }
    }

    this.logger.log(
      `[dept-backfill] scannedPairs=${pairs.size} created=${created} skippedExisting=${skippedExisting} skippedNoUni=${skippedNoUni} affectedUniversities=${touchedUniNames.size}`,
    );

    // 5) 对仍然 0 dept 的学校，自动创建"整体公告"占位 dept，确保用户能订阅
    const fillResult = await this.ensureOverallDeptForEmptySchools();

    return {
      scannedPairs: pairs.size,
      created,
      skippedExisting,
      skippedNoUni,
      universities: touchedUniNames.size,
      overallPlaceholders: fillResult,
    };
  }

  /**
   * 给所有"0 active dept"的 University 自动创建"整体公告"占位 dept。
   * 用于 211 / 双一流 等在 baoyantongzhi 没有具体 college 数据的学校，
   * 让用户至少能订阅"全校层级"。
   */
  async ensureOverallDeptForEmptySchools(): Promise<{ created: number; alreadyOk: number }> {
    const universities = await this.prisma.university.findMany({
      where: { level: { in: ['985', '211', '双一流', '中科院'] } },
      include: {
        _count: { select: { departments: { where: { active: true } } } },
      },
    });

    let created = 0;
    let alreadyOk = 0;
    for (const u of universities) {
      if (u._count.departments > 0) {
        alreadyOk++;
        continue;
      }
      const slug = `uni-${u.id.slice(0, 8)}`;
      const deptId = `${slug}-overall`;
      const existing = await this.prisma.department.findUnique({ where: { id: deptId } });
      if (existing) {
        alreadyOk++;
        continue;
      }
      try {
        await this.prisma.department.create({
          data: {
            id: deptId,
            schoolSlug: slug,
            universityId: u.id,
            name: '整体公告 · 全校通用',
            shortName: '全校',
            homepage: u.website,
            noticeUrl: (u as any).gradWebsite || u.website,
            majors: JSON.stringify([]),
            active: true,
          },
        });
        created++;
      } catch (e: any) {
        this.logger.warn(`[overall-dept] 创建失败 ${u.name}: ${e?.message}`);
      }
    }
    this.logger.log(`[overall-dept] created=${created} alreadyOk=${alreadyOk}`);
    return { created, alreadyOk };
  }

  private inferDeptKind(name: string): string {
    if (!name) return 'other';
    if (/学院$/.test(name)) return 'school';
    if (/书院$/.test(name) || /学堂$/.test(name)) return 'academy';
    if (/实验室$/.test(name)) return 'lab';
    if (/中心$/.test(name)) return 'center';
    if (/研究院$|研究所$/.test(name)) return 'institute';
    if (/系$|学部$/.test(name)) return 'department';
    return 'other';
  }

  private makeShortName(name: string): string {
    if (!name) return '';
    for (const suf of ['学院', '研究院', '研究所', '中心', '实验室', '书院', '学堂', '系', '学部']) {
      if (name.endsWith(suf)) return name.slice(0, -suf.length).slice(0, 4) || name.slice(0, 4);
    }
    return name.slice(0, 4);
  }

  /**
   * 按学校名精确查询 baoyantongzhi，拉单条记录抽 logoEnglishName。
   * 比批量分页方法更可靠（不会因为分页早 break 而漏校徽）。
   */
  private async fetchOneRecordBySchool(schoolName: string, year: number): Promise<any | null> {
    try {
      const resp = await axios.get(`${this.API_BASE}${this.LIST_PATH}`, {
        params: { current: 1, size: 5, orderBy: 'endTime', year, school: schoolName },
        headers: {
          Referer: 'https://www.baoyantongzhi.com/',
          Origin: 'https://www.baoyantongzhi.com',
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 6_000,
      });
      const recs = resp.data?.data?.records || [];
      const exact = recs.find((r: any) => r.school === schoolName && r.logoEnglishName);
      return exact || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 兜底：精确按学校名查 baoyantongzhi 补 logo（针对批量分页漏抓的小众学校）。
   * 仅处理 DB 现存 logo 为 favicon 或空的 university。
   */
  async backfillLogosBySchool(): Promise<{ targeted: number; updated: number }> {
    const candidates = await this.prisma.university.findMany({
      where: {
        OR: [
          { logo: null },
          { logo: { endsWith: 'favicon.ico' } },
        ],
      },
      select: { id: true, name: true },
    });
    let updated = 0;
    for (const u of candidates) {
      let rec = null;
      for (const year of [2026, 2025, 2024, 2023]) {
        rec = await this.fetchOneRecordBySchool(u.name, year);
        if (rec) break;
      }
      if (rec?.logoEnglishName) {
        const newUrl = `${this.API_BASE}/backgd/notice/logo/download/${rec.logoEnglishName}`;
        await this.prisma.university.update({ where: { id: u.id }, data: { logo: newUrl } });
        updated++;
      }
    }
    this.logger.log(`[logo-by-school] targeted=${candidates.length} updated=${updated}`);
    return { targeted: candidates.length, updated };
  }

  /**
   * 轻量校徽回填：只读 baoyantongzhi 每条记录的 logoEnglishName，
   * 更新 University.logo，跳过 camp ingest / LLM / match scheduling。
   * 比 syncFull 快 10×，不会触发 LLM 调用。
   */
  async backfillLogosOnly(years: number[] = [2026, 2025, 2024, 2023]): Promise<{
    scanned: number;
    updated: number;
    schools: number;
  }> {
    let scanned = 0;
    let updated = 0;
    const seenSchools = new Set<string>();
    // school name → logoEnglishName (per school 只记一次，先到先得)
    const logoMap = new Map<string, string>();

    for (const year of years) {
      for (const level of ['985', '211', '双一流']) {
        let current = 1;
        const size = 50;
        while (true) {
          const records = await this.fetchPage(current, size, year, level).catch(() => []);
          if (!records.length) break;
          scanned += records.length;
          for (const r of records) {
            if (!r.school || !r.logoEnglishName) continue;
            seenSchools.add(r.school);
            if (!logoMap.has(r.school)) {
              logoMap.set(r.school, r.logoEnglishName);
            }
          }
          if (records.length < size) break;
          current++;
          if (current > 30) break;
        }
      }
    }

    // 批量更新
    if (logoMap.size) {
      const universities = await this.prisma.university.findMany({
        where: { name: { in: Array.from(logoMap.keys()) } },
        select: { id: true, name: true, logo: true },
      });
      for (const u of universities) {
        const logoName = logoMap.get(u.name);
        if (!logoName) continue;
        const newUrl = `${this.API_BASE}/backgd/notice/logo/download/${logoName}`;
        // 覆盖逻辑同 ingestRecords：空 / favicon / 老 sealos URL → 更新
        const isStub = !u.logo || /favicon\.ico$/i.test(u.logo);
        const isOldMirror = u.logo && u.logo.includes('sealosgzg.site') && u.logo !== newUrl;
        if (!isStub && !isOldMirror) continue;
        await this.prisma.university.update({ where: { id: u.id }, data: { logo: newUrl } });
        updated++;
      }
    }

    this.logger.log(
      `[logo-backfill] scanned=${scanned} updated=${updated} uniqueSchools=${seenSchools.size}`,
    );
    return { scanned, updated, schools: seenSchools.size };
  }

  async syncFull(year: number, universityLevel = '985'): Promise<{ fetched: number }> {
    // 重置 dept 缓存（避免长 session 缓存老数据）
    this.deptCacheByUni.clear();
    let current = 1;
    const size = 50;
    let fetched = 0;
    while (true) {
      const records = await this.fetchPage(current, size, year, universityLevel).catch((e) => {
        this.logger.warn(`fetchPage(${current}) 失败: ${e?.message}`);
        return [] as any[];
      });
      if (!records.length) break;
      await this.ingestRecords(records, `baoyantongzhi-${universityLevel}-${year}-p${current}`);
      fetched += records.length;
      if (records.length < size) break;
      current += 1;
      if (current > 30) break;
    }
    return { fetched };
  }

  /**
   * 一次性回填：扫所有 sourceUrl 来自镜像但缺 departmentId 的 CampInfo
   * 通过 title 模糊匹配 dept 名 → 写入 departmentId → 触发 match。
   */
  async backfillDepartmentIdsAndMatch(): Promise<{
    scanned: number;
    patched: number;
    matchTriggered: number;
    universityLevelKept: number;
  }> {
    this.deptCacheByUni.clear();
    const candidates = await this.prisma.campInfo.findMany({
      where: {
        departmentId: null,
        OR: [
          { sourceUrl: { contains: 'mp.weixin.qq.com' } },
          { sourceUrl: { contains: 'baoyantongzhi.com' } },
        ],
      },
      select: { id: true, universityId: true, title: true },
    });

    const byUni = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const list = byUni.get(c.universityId) || [];
      list.push(c);
      byUni.set(c.universityId, list);
    }

    let patched = 0;
    let universityLevelKept = 0;
    const matchByDept = new Map<string, string[]>();
    const matchByUni = new Map<string, string[]>();

    for (const [universityId, items] of byUni.entries()) {
      const cache = await this.getDeptCache(universityId);
      for (const it of items) {
        const deptId = this.resolveDeptIdFromTitle(it.title, cache);
        if (deptId) {
          await this.prisma.campInfo.update({
            where: { id: it.id },
            data: { departmentId: deptId },
          });
          patched++;
          const arr = matchByDept.get(deptId) || [];
          arr.push(it.id);
          matchByDept.set(deptId, arr);
        } else {
          // 解析不出 dept → 视为"全校层级"，仍触发 university-level 匹配
          universityLevelKept++;
          const arr = matchByUni.get(universityId) || [];
          arr.push(it.id);
          matchByUni.set(universityId, arr);
        }
      }
    }

    let matchTriggered = 0;
    const matchScheduler = MatchSchedulerSingleton(this.prisma, this.configService, this.logger);
    for (const [deptId, campIds] of matchByDept.entries()) {
      await matchScheduler.scheduleMatching(deptId, campIds);
      matchTriggered += campIds.length;
    }
    for (const [uniId, campIds] of matchByUni.entries()) {
      await matchScheduler.scheduleMatchingForUniversity(uniId, campIds);
      matchTriggered += campIds.length;
    }

    this.logger.log(
      `[backfill] scanned=${candidates.length} patched=${patched} universityLevelKept=${universityLevelKept} matchTriggered=${matchTriggered}`,
    );
    return { scanned: candidates.length, patched, matchTriggered, universityLevelKept };
  }

  private async fetchPage(
    current: number,
    size: number,
    year: number,
    universityLevel: string,
  ): Promise<any[]> {
    const url = `${this.API_BASE}${this.LIST_PATH}`;
    const resp = await axios.get(url, {
      params: { current, size, orderBy: 'endTime', universityLevel, year },
      headers: {
        Referer: 'https://www.baoyantongzhi.com/',
        Origin: 'https://www.baoyantongzhi.com',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (baoyanwang-mirror)',
      },
      timeout: 10_000,
    });
    if (resp.data?.code !== 200) {
      throw new Error(`baoyantongzhi api code=${resp.data?.code} msg=${resp.data?.msg}`);
    }
    return resp.data?.data?.records || [];
  }

  private async ingestRecords(records: any[], spiderTag: string) {
    if (!records.length) return;
    const schoolNames = Array.from(new Set(records.map((r) => r.school).filter(Boolean)));
    const universities = await this.prisma.university.findMany({
      where: { name: { in: schoolNames } },
      select: { id: true, name: true, logo: true },
    });
    const uniByName = new Map(universities.map((u) => [u.name, u.id]));
    const uniLogoByName = new Map(universities.map((u) => [u.name, u.logo]));

    // 顺便回填 University.logo：从镜像源 logoEnglishName 构造真正的校徽 PNG URL。
    // 覆盖逻辑：
    //   - DB 现存 logo 为空 → 写入
    //   - DB 现存是 favicon.ico（老数据 stub，质量差）→ 用镜像源校徽覆盖
    //   - DB 现存是镜像源校徽 → 不覆盖（已最新）
    //   - DB 现存是其他来源（用户手动配置）→ 不覆盖
    const logoUpdates = new Map<string, string>();
    for (const r of records) {
      if (!r.school || !r.logoEnglishName) continue;
      const universityId = uniByName.get(r.school);
      if (!universityId) continue;
      const existing = uniLogoByName.get(r.school);
      const isStub = !existing || /favicon\.ico$/i.test(existing) || existing.includes('sealosgzg.site');
      if (!isStub) continue; // 用户手动设置过的 logo 不覆盖
      if (logoUpdates.has(universityId)) continue;
      const logoUrl = `${this.API_BASE}/backgd/notice/logo/download/${r.logoEnglishName}`;
      if (logoUrl === existing) continue; // 已是最新
      logoUpdates.set(universityId, logoUrl);
    }
    if (logoUpdates.size) {
      for (const [uniId, logoUrl] of logoUpdates.entries()) {
        try {
          await this.prisma.university.update({
            where: { id: uniId },
            data: { logo: logoUrl },
          });
        } catch (e: any) {
          this.logger.warn(`[mirror] logo 写入失败 uniId=${uniId}: ${e?.message}`);
        }
      }
      this.logger.log(`[mirror] ${spiderTag} 写入 ${logoUpdates.size} 个 University.logo`);
    }

    const items: any[] = [];
    let skippedNoUni = 0;
    let mappedDepts = 0;
    let universityLevel = 0; // 全校类（无 dept 归属）计数

    for (const r of records) {
      const universityId = uniByName.get(r.school);
      if (!universityId) {
        skippedNoUni++;
        continue;
      }
      // 解析 college → departmentId
      // 特殊：college = "全校类" → 不解析 dept，作为 university-level orphan 入库
      //   下面 triggerMatchingFor 会调 scheduleMatchingForUniversity 给该校所有 dept 订阅用户跑匹配
      let departmentId: string | null = null;
      if (r.college && r.college !== '全校类') {
        const cache = await this.getDeptCache(universityId);
        departmentId = this.resolveDeptId(r.college, cache);
        if (departmentId) mappedDepts++;
      } else if (r.college === '全校类') {
        universityLevel++;
      }

      items.push({
        title: this.normalize(r.name, 200),
        announcementType: this.mapRecruitType(r.recruitType),
        subType: 'specific',
        universityId,
        departmentId, // 关键：可以为 null（dept 解析不出来时仍入库，但仅 universityId）
        sourceUrl: r.websiteUrl || `https://www.baoyantongzhi.com/notice/detail/${r.id}`,
        publishDate: this.toIso(r.publishTime),
        deadline: this.toIso(r.endTime),
        startDate: this.toIso(r.startTime),
        endDate: this.toIso(r.endTime),
        location: this.normalize(r.location, 80),
        requirements: {},
        materials: [],
        process: [],
        contact: {},
        // 给 LLM 匹配用的兜底 content：用标题 + 院校 + 院系 + 类型组成最小文本
        content: `${r.name}\n学校：${r.school}\n院系：${r.college || ''}\n类型：${r.recruitType}\n报名截止：${r.endTime || ''}`,
        confidence: 0.92,
        crawlTime: new Date().toISOString(),
        spiderName: spiderTag,
      });
    }

    if (!items.length) {
      this.logger.log(`[mirror] ${spiderTag} 无可入库（matched=0 skipped=${skippedNoUni}）`);
      return;
    }
    const result = await this.crawlerService.ingestCamps(items, {
      emitBaselineEvents: false,
      sourceType: 'mirror',
    });
    this.logger.log(
      `[mirror] ${spiderTag} processed=${result.processed} created=${result.created} updated=${result.updated} mappedDepts=${mappedDepts}/${items.length} universityLevel=${universityLevel}`,
    );

    // 触发 LLM 匹配：分两路
    //   - dept-level: scheduleMatching(deptId, [campIds])
    //   - university-level orphan (全校类): scheduleMatchingForUniversity(uniId, [campIds])
    await this.triggerMatchingFor(items, result);
  }

  /**
   * ingest 后查回 campIds，分两路调 match-scheduler：
   *   1) dept-level: 按 departmentId 聚合
   *   2) university-level orphan: 按 universityId 聚合（仅那些 departmentId IS NULL 的）
   */
  private async triggerMatchingFor(items: any[], result: { processed: number }) {
    if (!result?.processed) return;
    if (!items.length) return;

    const sourceUrls = items.map((i) => i.sourceUrl);
    const camps = await this.prisma.campInfo.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { id: true, sourceUrl: true, departmentId: true, universityId: true },
    });

    const byDept = new Map<string, string[]>();
    const byUni = new Map<string, string[]>(); // 全校层级（无 dept）

    for (const c of camps) {
      if (c.departmentId) {
        const arr = byDept.get(c.departmentId) || [];
        arr.push(c.id);
        byDept.set(c.departmentId, arr);
      } else if (c.universityId) {
        const arr = byUni.get(c.universityId) || [];
        arr.push(c.id);
        byUni.set(c.universityId, arr);
      }
    }

    const matchScheduler = MatchSchedulerSingleton(this.prisma, this.configService, this.logger);

    // dept-level
    for (const [deptId, campIds] of byDept.entries()) {
      await matchScheduler.scheduleMatching(deptId, campIds);
    }
    // university-level (全校类)
    for (const [uniId, campIds] of byUni.entries()) {
      await matchScheduler.scheduleMatchingForUniversity(uniId, campIds);
    }

    const deptCount = Array.from(byDept.values()).reduce((s, a) => s + a.length, 0);
    const uniCount = Array.from(byUni.values()).reduce((s, a) => s + a.length, 0);
    this.logger.log(
      `[mirror-match] triggered dept=${deptCount}/${byDept.size} + univ=${uniCount}/${byUni.size}`,
    );
  }

  // ---------- dept name resolution ----------

  private async getDeptCache(universityId: string): Promise<Map<string, string>> {
    if (this.deptCacheByUni.has(universityId)) {
      return this.deptCacheByUni.get(universityId)!;
    }
    const depts = await this.prisma.department.findMany({
      where: { universityId, active: true },
      select: { id: true, name: true, shortName: true },
    });
    const m = new Map<string, string>();
    for (const d of depts) {
      m.set(this.normalizeDeptName(d.name), d.id);
      if (d.shortName) m.set(this.normalizeDeptName(d.shortName), d.id);
    }
    this.deptCacheByUni.set(universityId, m);
    return m;
  }

  private normalizeDeptName(s: string): string {
    return (s || '').replace(/\s+/g, '').replace(/[()（）·]/g, '').toLowerCase();
  }

  /** 直接拿 college 字段去匹配 dept */
  private resolveDeptId(college: string, cache: Map<string, string>): string | null {
    if (!college) return null;
    const norm = this.normalizeDeptName(college);
    if (cache.has(norm)) return cache.get(norm)!;
    // 包含关系：找最长匹配
    let best: { score: number; id: string } | null = null;
    for (const [key, id] of cache.entries()) {
      if (norm.includes(key) || key.includes(norm)) {
        const score = Math.min(key.length, norm.length);
        if (!best || score > best.score) best = { score, id };
      }
    }
    return best?.id || null;
  }

  /** 从 title 里反解 dept（用于 backfill） */
  private resolveDeptIdFromTitle(title: string, cache: Map<string, string>): string | null {
    if (!title) return null;
    const norm = this.normalizeDeptName(title);
    let best: { score: number; id: string } | null = null;
    for (const [key, id] of cache.entries()) {
      if (key.length < 3) continue; // 跳过过短 short-name 误命中（"院"之类）
      if (norm.includes(key)) {
        if (!best || key.length > best.score) best = { score: key.length, id };
      }
    }
    return best?.id || null;
  }

  // ---------- helpers ----------

  private mapRecruitType(t: string): 'summer_camp' | 'pre_recommendation' {
    if (!t) return 'summer_camp';
    if (t.includes('预推免') || t.includes('正式推免')) return 'pre_recommendation';
    return 'summer_camp';
  }

  private toIso(value: any): string | null {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;
    const normalized = s.replace(' ', 'T');
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  private normalize(s: any, max: number): string {
    if (!s) return '';
    return String(s).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  // ---------- 健康监控 ----------

  private recordSyncOutcome(ok: boolean, error: string | null, count: number, scope: string) {
    this.lastSyncAt = new Date();
    this.lastSyncOk = ok;
    this.lastError = ok ? null : error;
    this.lastFetchedCount = count;
    if (ok) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }
    this.syncHistory.unshift({ at: new Date(), ok, scope, count, error });
    // 仅保留最近 50 条
    if (this.syncHistory.length > 50) this.syncHistory = this.syncHistory.slice(0, 50);
  }

  getHealth() {
    return {
      consecutiveFailures: this.consecutiveFailures,
      lastSyncAt: this.lastSyncAt,
      lastSyncOk: this.lastSyncOk,
      lastError: this.lastError,
      lastFetchedCount: this.lastFetchedCount,
      degraded: this.consecutiveFailures >= 3,
      recentHistory: this.syncHistory.slice(0, 20),
    };
  }

  /**
   * 给 snapshot 服务调：取所有"疑似镜像源"写入的 camp（按 sourceUrl 启发式判断）。
   * 包含：
   *   - 微信公众号文章（mp.weixin.qq.com，spider 不抓的，几乎都是 mirror 来的）
   *   - baoyantongzhi 落地页（兜底）
   *   - 最近 30 天创建的所有 camp（即使是自爬的也一起备份，没有坏处）
   */
  async listMirrorCamps(limit = 10000) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.prisma.campInfo.findMany({
      where: {
        OR: [
          { sourceUrl: { contains: 'mp.weixin.qq.com' } },
          { sourceUrl: { contains: 'baoyantongzhi.com' } },
          { createdAt: { gte: thirtyDaysAgo } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        universityId: true,
        departmentId: true,
        title: true,
        announcementType: true,
        sourceUrl: true,
        deadline: true,
        startDate: true,
        endDate: true,
        location: true,
        publishDate: true,
        confidence: true,
        updatedAt: true,
      },
    });
  }
}
