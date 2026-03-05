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
    year?: number;
  }) {
    const { page, limit, universityId, universityIds, majorId, status, year } = params;
    const skip = (page - 1) * limit;

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

    if (year) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      where.AND = [
        {
          OR: [
            { publishDate: { gte: yearStart, lt: yearEnd } },
            { deadline: { gte: yearStart, lt: yearEnd } },
            { startDate: { gte: yearStart, lt: yearEnd } },
            { endDate: { gte: yearStart, lt: yearEnd } },
          ],
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.campInfo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishDate: 'desc' },
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
