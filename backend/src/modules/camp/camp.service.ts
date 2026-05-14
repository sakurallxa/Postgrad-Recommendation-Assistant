import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    universityId?: string;
    universityIds?: string[];
    majorId?: string;
    status?: string;
    announcementType?: string;
    year?: number;
    keyword?: string;
    actionableOnly?: boolean;
    includeFramework?: boolean;
    universityLevel?: string;
  }) {
    const { page, limit, universityId, universityIds, majorId, status, announcementType, year, keyword, actionableOnly, includeFramework, universityLevel } = params;
    const skip = (page - 1) * limit;
    const andConditions: any[] = [];

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    } else if (!status) {
      // 兼容历史默认行为：未传status时仅返回published
      where.status = 'published';
    }

    if (universityIds && universityIds.length > 0) {
      where.universityId = { in: universityIds };
    } else if (universityId) {
      where.universityId = universityId;
    }

    if (majorId) where.majorId = majorId;
    if (announcementType && announcementType !== 'all') {
      where.announcementType = announcementType;
    }
    // 默认隐藏 framework 类（章程/工作办法），用户主动 includeFramework=true 才显示
    if (!includeFramework) {
      where.subType = { not: 'framework' };
    }
    // MVP β: 默认只返回985院校的公告，用户指定 universityLevel='all' 才显示全部
    // 当 universityId/universityIds 已指定具体院校时，跳过 level 过滤（用户已显式选了）
    if (!universityId && !universityIds?.length && universityLevel !== 'all') {
      const targetLevel = universityLevel || '985';
      where.university = { ...(where.university || {}), level: targetLevel };
    }

    const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
    if (normalizedKeyword) {
      where.OR = [
        { title: { contains: normalizedKeyword } },
        { rawContent: { contains: normalizedKeyword } },
        { university: { name: { contains: normalizedKeyword } } },
        { major: { name: { contains: normalizedKeyword } } },
      ];
    }

    if (actionableOnly) {
      const now = new Date();
      const freshnessStart = new Date(now.getFullYear() - 1, 0, 1);
      where.NOT = [
        { title: { contains: '拟录取' } },
        { title: { contains: '录取名单' } },
        { title: { contains: '名单公示' } },
        { title: { contains: '公示名单' } },
        { title: { contains: '公示已结束' } },
        { title: { contains: '营员名单' } },
        { title: { contains: '入围营员' } },
        { title: { contains: '复试名单' } },
        { title: { contains: '复试结果' } },
        { title: { contains: '结果公示' } },
        { title: { contains: '录取结果' } },
        { title: { contains: '录取公示' } },
        { title: { contains: '考试报名' } },
        { title: { contains: '网上确认' } },
        { title: '研究生招生信息网' },
      ];
      andConditions.push({
        OR: [
          { publishDate: { gte: freshnessStart } },
          { deadline: { gte: freshnessStart } },
          { startDate: { gte: freshnessStart } },
          { endDate: { gte: freshnessStart } },
        ],
      });
    }

    if (year) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      andConditions.push({
        OR: [
          { publishDate: { gte: yearStart, lt: yearEnd } },
          { deadline: { gte: yearStart, lt: yearEnd } },
          { startDate: { gte: yearStart, lt: yearEnd } },
          { endDate: { gte: yearStart, lt: yearEnd } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [data, total] = await Promise.all([
      this.prisma.campInfo.findMany({
        where,
        skip,
        take: limit,
        orderBy: actionableOnly
          ? [
              { publishDate: 'desc' },
              { deadline: { sort: 'asc', nulls: 'last' } },
            ]
          : { publishDate: 'desc' },
        include: {
          university: true,
          major: true,
        },
      }),
      this.prisma.campInfo.count({ where }),
    ]);

    return {
      data: data.map((item) => this.normalizeStructuredCamp(item)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const camp = await this.prisma.campInfo.findUnique({
      where: { id },
      include: {
        university: {
          select: {
            id: true,
            name: true,
            logo: true,
            level: true,
            website: true,
          },
        },
        major: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        progressChangeEvents: {
          orderBy: [{ sourceUpdatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 8,
          select: {
            id: true,
            eventType: true,
            fieldName: true,
            oldValue: true,
            newValue: true,
            sourceType: true,
            sourceUrl: true,
            sourceUpdatedAt: true,
            confidenceLabel: true,
            confidenceScore: true,
            createdAt: true,
          },
        },
        extractionLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            provider: true,
            model: true,
            extractionVersion: true,
            confidenceScore: true,
            status: true,
            triggerReasons: true,
            createdAt: true,
          },
        },
      },
    });

    if (!camp) {
      throw new NotFoundException('夏令营不存在');
    }

    return this.normalizeStructuredCamp(camp);
  }

  private normalizeStructuredCamp(camp: any) {
    if (!camp || typeof camp !== 'object') {
      return camp;
    }

    const normalized = { ...camp };

    if (Object.prototype.hasOwnProperty.call(camp, 'requirements')) {
      normalized.requirements = this.parseStructuredObject(camp.requirements);
    }
    if (Object.prototype.hasOwnProperty.call(camp, 'materials')) {
      normalized.materials = this.parseStructuredArray(camp.materials);
    }
    if (Object.prototype.hasOwnProperty.call(camp, 'process')) {
      normalized.process = this.parseStructuredArray(camp.process);
    }
    if (Object.prototype.hasOwnProperty.call(camp, 'contact')) {
      normalized.contact = this.parseStructuredObject(camp.contact);
    }
    if (Object.prototype.hasOwnProperty.call(camp, 'progressChangeEvents')) {
      normalized.progressChangeEvents = this.normalizeProgressChangeEvents(camp.progressChangeEvents);
      normalized.lastCrawledAt = this.resolveLastCrawledAt(camp.progressChangeEvents, camp.updatedAt);
    }
    if (Object.prototype.hasOwnProperty.call(camp, 'extractionLogs')) {
      if (Array.isArray(camp.extractionLogs) && camp.extractionLogs.length > 0) {
        normalized.latestExtraction = this.normalizeLatestExtraction(camp.extractionLogs[0]);
      } else {
        normalized.latestExtraction = null;
      }
    }

    return normalized;
  }

  private normalizeProgressChangeEvents(events: any[]): any[] {
    if (!Array.isArray(events)) {
      return [];
    }

    return events.map((item) => ({
      ...item,
      oldValueParsed: this.parseStructuredValue(item?.oldValue),
      newValueParsed: this.parseStructuredValue(item?.newValue),
    }));
  }

  private resolveLastCrawledAt(events: any[], updatedAt: Date | null): Date | null {
    const sourceUpdatedTimes = (Array.isArray(events) ? events : [])
      .map((item) => (item?.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null))
      .filter((time) => time && !Number.isNaN(time.getTime())) as Date[];

    if (sourceUpdatedTimes.length > 0) {
      sourceUpdatedTimes.sort((a, b) => b.getTime() - a.getTime());
      return sourceUpdatedTimes[0];
    }

    if (updatedAt && !Number.isNaN(new Date(updatedAt).getTime())) {
      return updatedAt;
    }

    return null;
  }

  private normalizeLatestExtraction(extraction: any) {
    if (!extraction || typeof extraction !== 'object') {
      return null;
    }

    return {
      id: extraction.id,
      provider: extraction.provider || '',
      model: extraction.model || '',
      extractionVersion: extraction.extractionVersion || '',
      confidenceScore: extraction.confidenceScore,
      status: extraction.status || '',
      triggerReasons: this.parseStructuredArray(extraction.triggerReasons),
      createdAt: extraction.createdAt || null,
    };
  }

  private parseStructuredObject(value: any): Record<string, any> {
    const parsed = this.parseStructuredValue(value);

    if (!parsed) {
      return {};
    }

    if (Array.isArray(parsed)) {
      return { other: parsed };
    }

    if (typeof parsed === 'object') {
      return parsed;
    }

    return { raw: String(parsed) };
  }

  private parseStructuredArray(value: any): any[] {
    const parsed = this.parseStructuredValue(value);

    if (!parsed) {
      return [];
    }

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed === 'object') {
      return [parsed];
    }

    const text = String(parsed).trim();
    if (!text) {
      return [];
    }

    return text
      .split(/[\n；;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseStructuredValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }
}
