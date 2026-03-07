import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { ProgressService } from '../progress/progress.service';
import { CrawlerCampItemDto } from './dto/ingest-camps.dto';
import { CampInfoExtraction, DeepSeekService } from '../../common/services/deepseek.service';

type ProgressEventType = 'deadline' | 'materials' | 'admission_result' | 'outstanding_result';

interface CampDiffField {
  fieldName: string;
  eventType: ProgressEventType;
  oldValue: string;
  newValue: string;
}

interface IngestCampOptions {
  emitBaselineEvents?: boolean;
  sourceType?: string;
  sourceUpdatedAt?: Date;
}

interface LlmFallbackDecision {
  shouldExtract: boolean;
  reasons: string[];
  snippet: string;
}

interface LlmFallbackResult {
  item: CrawlerCampItemDto;
  used: boolean;
  success: boolean;
  reasons: string[];
  snippet: string;
  extraction?: CampInfoExtraction | null;
  error?: string;
  logId?: string;
}

const FALLBACK_EXTRACTION_VERSION = 'deepseek-fallback-v1';
const DEFAULT_SNIPPET_MAX_LENGTH = 1500;

type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

interface MinimalJsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  required?: string[];
  properties?: Record<string, MinimalJsonSchema>;
  items?: MinimalJsonSchema;
  enum?: Array<string | number | boolean | null>;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  anyOf?: MinimalJsonSchema[];
}

const CAMP_EXTRACTION_JSON_SCHEMA: MinimalJsonSchema = {
  type: 'object',
  required: ['title', 'requirements', 'materials', 'process', 'contact', 'confidence'],
  properties: {
    title: { type: 'string', minLength: 1 },
    announcementType: {
      type: 'string',
      enum: ['summer_camp', 'pre_recommendation'],
    },
    publishDate: { type: 'string' },
    deadline: { type: 'string' },
    startDate: { type: 'string' },
    endDate: { type: 'string' },
    requirements: { type: 'object' },
    materials: {
      type: 'array',
      items: {
        anyOf: [{ type: 'string' }, { type: 'object' }],
      },
    },
    process: {
      type: 'array',
      items: {
        anyOf: [{ type: 'string' }, { type: 'object' }],
      },
    },
    contact: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        other: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const TRACKED_FIELD_EVENT_MAP: Record<string, ProgressEventType> = {
  announcementType: 'materials',
  title: 'materials',
  sourceUrl: 'materials',
  publishDate: 'deadline',
  deadline: 'deadline',
  startDate: 'deadline',
  endDate: 'deadline',
  requirements: 'materials',
  materials: 'materials',
  process: 'materials',
  contact: 'materials',
};

interface CrawlerTask {
  id: string;
  logId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  universityId?: string;
  priority?: string;
  yearSpan?: number;
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

/**
 * 爬虫服务
 * 负责触发和管理Python爬虫任务
 */
@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly crawlerPath: string;
  private activeTasks: Map<string, CrawlerTask> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly progressService: ProgressService,
    private readonly deepSeekService: DeepSeekService,
  ) {
    // 爬虫项目路径
    this.crawlerPath = path.resolve(process.cwd(), '..', 'crawler');
  }

  /**
   * 触发爬虫任务
   * 支持全量爬取或指定院校
   */
  async trigger(universityId?: string, priority?: string, yearSpan: number = 3) {
    // 检查是否已有运行中的任务
    const runningTasks = Array.from(this.activeTasks.values()).filter(
      task => task.status === 'running'
    );
    
    if (runningTasks.length > 0) {
      throw new BadRequestException('已有爬虫任务正在运行，请等待完成后再触发');
    }

    // 先创建数据库记录，获取logId
    const log = await this.prisma.crawlerLog.create({
      data: {
        universityId: universityId || 'all',
        status: 'running',
        startTime: new Date(),
      },
    });

    // 统一任务ID语义：对外taskId恒等于数据库log.id
    const taskId = log.id;

    // 创建任务记录
    const task: CrawlerTask = {
      id: taskId,
      logId: log.id,
      status: 'pending',
      universityId,
      priority,
      yearSpan,
    };
    this.activeTasks.set(taskId, task);

    // 异步执行爬虫
    this.executeCrawler(task);

    return {
      message: '爬虫任务已触发',
      taskId,
      logId: log.id,
      status: 'running',
    };
  }

  /**
   * 执行爬虫命令
   */
  private async executeCrawler(task: CrawlerTask): Promise<void> {
    task.status = 'running';
    task.startTime = new Date();

    try {
      const args = ['crawl', 'university'];
      const exportFilePath = await this.buildExportFilePath(task.id);
      
      if (task.universityId) {
        args.push('-a', `university_id=${task.universityId}`);
      }
      if (task.priority) {
        args.push('-a', `priority=${task.priority}`);
      }
      args.push('-a', `year_span=${task.yearSpan || 3}`);
      // 使用导出文件作为统一入库源，避免缺失 pipeline 时无法入库。
      args.push('-O', exportFilePath);
      this.applyCompatibilitySettings(args);

      this.logger.log(`启动爬虫任务: ${task.id}, 参数: ${args.join(' ')}`);

      const result = await this.runScrapyCommand(args);
      const ingestSummary = await this.ingestFromExportFile(exportFilePath);
      
      task.status = 'completed';
      task.endTime = new Date();
      task.result = {
        ...result,
        ingestSummary,
      };

      // 使用logId精确更新数据库记录
      await this.prisma.crawlerLog.update({
        where: { id: task.logId },
        data: {
          status: 'success',
          endTime: new Date(),
          itemsCount: ingestSummary.processed || result.itemCount || 0,
        },
      });

      this.logger.log(`爬虫任务完成: ${task.id}`);
      
      // 清理已完成的任务（1小时后）
      this.scheduleTaskCleanup(task.id);
    } catch (error) {
      task.status = 'failed';
      task.endTime = new Date();
      task.error = error.message;

      // 使用logId精确更新数据库记录
      await this.prisma.crawlerLog.update({
        where: { id: task.logId },
        data: {
          status: 'failed',
          endTime: new Date(),
          errorMsg: error.message,
        },
      });

      this.logger.error(`爬虫任务失败: ${task.id}`, error.message);
      
      // 清理已完成的任务（1小时后）
      this.scheduleTaskCleanup(task.id);
    }
  }

  /**
   * 定时清理已完成的任务，防止内存泄漏
   */
  private scheduleTaskCleanup(taskId: string): void {
    setTimeout(() => {
      this.activeTasks.delete(taskId);
      this.logger.debug(`已清理完成任务: ${taskId}`);
    }, 60 * 60 * 1000); // 1小时后清理
  }

  /**
   * 运行Scrapy命令
   */
  private runScrapyCommand(args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const scrapyCmd = 'scrapy';
      const options = {
        cwd: this.crawlerPath,
        env: {
          ...process.env,
          PYTHONPATH: this.crawlerPath,
        },
      };

      this.logger.log(`执行命令: ${scrapyCmd} ${args.join(' ')}`);

      const child = spawn(scrapyCmd, args, options);
      
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        this.logger.log(`[Scrapy] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.warn(`[Scrapy Error] ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          // 解析输出结果
          const result = this.parseCrawlerOutput(stdout);
          resolve(result);
        } else {
          reject(new Error(`爬虫进程退出码: ${code}, 错误: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`启动爬虫失败: ${error.message}`));
      });

      // 设置超时 - 先发送SIGTERM，5秒后如果仍在运行则强制终止
      const timeoutHandle = setTimeout(() => {
        this.logger.warn(`爬虫任务超时，尝试终止进程: ${child.pid}`);
        child.kill('SIGTERM');
        
        // 5秒后强制终止
        setTimeout(() => {
          if (!child.killed) {
            this.logger.error(`爬虫进程未响应SIGTERM，强制终止: ${child.pid}`);
            child.kill('SIGKILL');
          }
        }, 5000);
      }, 30 * 60 * 1000); // 30分钟超时
      
      // 清理超时定时器
      child.on('close', () => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  /**
   * 解析爬虫输出
   */
  private parseCrawlerOutput(output: string): any {
    // 解析统计信息
    const stats: any = {
      itemCount: 0,
      requestCount: 0,
      errorCount: 0,
    };

    // 匹配统计信息
    const itemMatch = output.match(/(\d+) items scraped/);
    if (itemMatch) {
      stats.itemCount = parseInt(itemMatch[1], 10);
    }

    const requestMatch = output.match(/(\d+) requests/);
    if (requestMatch) {
      stats.requestCount = parseInt(requestMatch[1], 10);
    }

    const errorMatch = output.match(/(\d+) errors/);
    if (errorMatch) {
      stats.errorCount = parseInt(errorMatch[1], 10);
    }

    return stats;
  }

  async ingestCamps(items: CrawlerCampItemDto[], options: IngestCampOptions = {}) {
    const emitBaselineEvents = options.emitBaselineEvents !== false;
    const sourceType = options.sourceType || 'crawler';

    const summary = {
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      eventsCreated: 0,
      llmTriggered: 0,
      llmSuccess: 0,
      llmFailed: 0,
      errors: [] as Array<{ index: number; reason: string }>,
    };

    for (let index = 0; index < (items || []).length; index += 1) {
      const item = items[index];
      if (!this.isCampItemValid(item)) {
        summary.skipped += 1;
        summary.errors.push({
          index,
          reason: '缺少必要字段（title/universityId/sourceUrl）',
        });
        continue;
      }

      const sourceUpdatedAt = options.sourceUpdatedAt || this.resolveSourceUpdatedAt(item);
      const fallback = await this.applyDeepSeekFallback(item, summary);
      const sourceItem = fallback.item;
      const writeData = this.toCampWriteData(sourceItem);

      try {
        const existing = await this.findExistingCampByIdentityOrAlias(writeData);

        if (!existing) {
          const created = await this.prisma.campInfo.create({ data: writeData });
          await this.upsertCampAlias(created.id, writeData.universityId, writeData.sourceUrl, true);
          await this.bindExtractionLogToCamp(fallback.logId, created.id);
          await this.progressService.applySchoolDefaultSubscriptionsForCamp(
            created.id,
            writeData.universityId,
          );
          summary.created += 1;
          summary.processed += 1;

          if (emitBaselineEvents) {
            const baselineEvents = this.buildBaselineEvents(writeData);
            summary.eventsCreated += await this.createChangeEvents(
              created.id,
              baselineEvents,
              sourceType,
              writeData.sourceUrl,
              sourceUpdatedAt,
              this.extractSourceSnippet(sourceItem.content || sourceItem.title || ''),
            );
          }
          summary.eventsCreated += await this.emitInferredResultEvent(
            created.id,
            sourceItem,
            sourceType,
            writeData.sourceUrl,
            sourceUpdatedAt,
          );
          continue;
        }

        const diffs = this.diffCamp(existing, writeData);
        if (diffs.length === 0) {
          await this.bindExtractionLogToCamp(fallback.logId, existing.id);
          summary.unchanged += 1;
          summary.processed += 1;
          continue;
        }

        await this.prisma.campInfo.update({
          where: { id: existing.id },
          data: writeData,
        });
        await this.upsertCampAlias(existing.id, writeData.universityId, writeData.sourceUrl, true);
        await this.bindExtractionLogToCamp(fallback.logId, existing.id);
        await this.progressService.applySchoolDefaultSubscriptionsForCamp(
          existing.id,
          writeData.universityId,
        );

        summary.updated += 1;
        summary.processed += 1;
        summary.eventsCreated += await this.createChangeEvents(
          existing.id,
          diffs,
          sourceType,
          writeData.sourceUrl,
          sourceUpdatedAt,
          this.extractSourceSnippet(sourceItem.content || sourceItem.title || ''),
        );
        summary.eventsCreated += await this.emitInferredResultEvent(
          existing.id,
          sourceItem,
          sourceType,
          writeData.sourceUrl,
          sourceUpdatedAt,
        );
      } catch (error) {
        summary.skipped += 1;
        summary.errors.push({
          index,
          reason: error?.message || '入库失败',
        });
      }
    }

    return summary;
  }

  private async applyDeepSeekFallback(
    item: CrawlerCampItemDto,
    summary: { llmTriggered: number; llmSuccess: number; llmFailed: number },
  ): Promise<LlmFallbackResult> {
    const decision = this.evaluateDeepSeekFallback(item);
    if (!decision.shouldExtract) {
      return {
        item,
        used: false,
        success: false,
        reasons: [],
        snippet: decision.snippet,
      };
    }

    summary.llmTriggered += 1;

    if (!this.isDeepSeekFallbackEnabled()) {
      return {
        item,
        used: false,
        success: false,
        reasons: decision.reasons,
        snippet: decision.snippet,
      };
    }

    const content = this.normalizeText(item.content, this.getSnippetMaxLength() * 4);
    if (!content) {
      summary.llmFailed += 1;
      const logId = await this.createExtractionLog({
        item,
        reasons: decision.reasons,
        snippet: decision.snippet,
        status: 'fallback',
        errorMessage: 'content_empty',
        requestPayload: {},
      });
      return {
        item,
        used: true,
        success: false,
        reasons: decision.reasons,
        snippet: decision.snippet,
        error: 'content_empty',
        logId,
      };
    }

    const hint = this.buildExtractionHint(item);
    const requestPayload = {
      universityId: item.universityId,
      sourceUrl: item.sourceUrl,
      reasons: decision.reasons,
      hint,
    };

    try {
      const extraction = await this.deepSeekService.extractCampInfo(
        content,
        this.resolveUniversityNameHint(item),
        hint,
      );
      const validated = this.validateExtractionSchema(extraction);
      if (!validated.valid || !validated.data) {
        summary.llmFailed += 1;
        const logId = await this.createExtractionLog({
          item,
          reasons: decision.reasons,
          snippet: decision.snippet,
          status: 'invalid',
          errorMessage: validated.reason || 'schema_invalid',
          requestPayload,
          responsePayload: extraction || null,
          parsedResult: extraction || null,
        });
        return {
          item,
          used: true,
          success: false,
          reasons: decision.reasons,
          snippet: decision.snippet,
          extraction,
          error: validated.reason || 'schema_invalid',
          logId,
        };
      }

      const mergedItem = this.mergeFallbackExtraction(item, validated.data, decision.reasons);
      summary.llmSuccess += 1;
      const logId = await this.createExtractionLog({
        item: mergedItem,
        reasons: decision.reasons,
        snippet: decision.snippet,
        status: 'success',
        requestPayload,
        responsePayload: extraction || null,
        parsedResult: validated.data,
        confidenceScore: validated.data.confidence,
      });
      return {
        item: mergedItem,
        used: true,
        success: true,
        reasons: decision.reasons,
        snippet: decision.snippet,
        extraction: validated.data,
        logId,
      };
    } catch (error) {
      summary.llmFailed += 1;
      const errorMessage = error?.message || 'deepseek_error';
      const logId = await this.createExtractionLog({
        item,
        reasons: decision.reasons,
        snippet: decision.snippet,
        status: 'error',
        errorMessage,
        requestPayload,
      });
      return {
        item,
        used: true,
        success: false,
        reasons: decision.reasons,
        snippet: decision.snippet,
        error: errorMessage,
        logId,
      };
    }
  }

  private evaluateDeepSeekFallback(item: CrawlerCampItemDto): LlmFallbackDecision {
    const reasons: string[] = [];
    const confidence = this.normalizeConfidence(item?.confidence);
    if (confidence < this.getDeepSeekMinConfidence()) {
      reasons.push('low_confidence');
    }

    if (this.isStructuredEmpty(item?.materials)) {
      reasons.push('empty_materials');
    }
    if (this.isStructuredEmpty(item?.process)) {
      reasons.push('empty_process');
    }
    if (this.isStructuredEmpty(item?.requirements)) {
      reasons.push('missing_requirements');
    }

    const hasTimeInfo = Boolean(item?.deadline || item?.startDate || item?.endDate || item?.publishDate);
    if (!hasTimeInfo) {
      reasons.push('missing_time_fields');
    }

    if (this.hasAnnouncementTypeConflict(item)) {
      reasons.push('announcement_type_conflict');
    }

    const snippet = this.extractSourceSnippet(item?.content || '');
    return {
      shouldExtract: reasons.length > 0,
      reasons,
      snippet,
    };
  }

  private validateExtractionSchema(extraction: CampInfoExtraction | null): {
    valid: boolean;
    reason?: string;
    data?: CampInfoExtraction;
  } {
    if (!extraction) {
      return { valid: false, reason: 'empty_result' };
    }

    const schemaErrors = this.validateAgainstSchema(
      extraction,
      CAMP_EXTRACTION_JSON_SCHEMA,
      '$',
    );
    if (schemaErrors.length > 0) {
      return {
        valid: false,
        reason: `schema_validation_failed:${schemaErrors[0]}`,
      };
    }

    if (!this.normalizeText(extraction.title, 300)) {
      return { valid: false, reason: 'invalid_title' };
    }

    const announcementType = this.normalizeAnnouncementType(extraction.announcementType);
    const confidence = this.normalizeConfidence(extraction.confidence);
    if (confidence <= 0) {
      return { valid: false, reason: 'invalid_confidence' };
    }

    const requirements = this.normalizeStructuredForItem(extraction.requirements, {});
    const materials = this.normalizeStructuredArrayForItem(extraction.materials);
    const process = this.normalizeStructuredArrayForItem(extraction.process);
    const contact = this.normalizeStructuredForItem(extraction.contact, {});

    return {
      valid: true,
      data: {
        ...extraction,
        title: this.normalizeText(extraction.title, 300),
        announcementType,
        publishDate: this.normalizeDateString(extraction.publishDate),
        deadline: this.normalizeDateString(extraction.deadline),
        startDate: this.normalizeDateString(extraction.startDate),
        endDate: this.normalizeDateString(extraction.endDate),
        requirements,
        materials,
        process,
        contact,
        confidence,
      },
    };
  }

  private validateAgainstSchema(
    value: any,
    schema: MinimalJsonSchema,
    path: string,
  ): string[] {
    const errors: string[] = [];

    if (schema.anyOf && schema.anyOf.length > 0) {
      const anyPassed = schema.anyOf.some((candidate) =>
        this.validateAgainstSchema(value, candidate, path).length === 0,
      );
      if (!anyPassed) {
        errors.push(`${path} does not match anyOf schema`);
      }
      return errors;
    }

    if (schema.type) {
      const expectedTypes = Array.isArray(schema.type)
        ? schema.type
        : [schema.type];
      const actualType = this.detectJsonType(value);
      if (!expectedTypes.includes(actualType)) {
        errors.push(`${path} expected ${expectedTypes.join('|')} but got ${actualType}`);
        return errors;
      }
    }

    if (schema.enum && schema.enum.length > 0 && !schema.enum.includes(value)) {
      errors.push(`${path} is not in enum`);
      return errors;
    }

    if (typeof value === 'string') {
      if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
        errors.push(`${path} length < ${schema.minLength}`);
      }
    }

    if (typeof value === 'number') {
      if (typeof schema.minimum === 'number' && value < schema.minimum) {
        errors.push(`${path} < ${schema.minimum}`);
      }
      if (typeof schema.maximum === 'number' && value > schema.maximum) {
        errors.push(`${path} > ${schema.maximum}`);
      }
    }

    if (Array.isArray(value)) {
      if (schema.items) {
        value.forEach((entry, index) => {
          errors.push(
            ...this.validateAgainstSchema(entry, schema.items as MinimalJsonSchema, `${path}[${index}]`),
          );
        });
      }
      return errors;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const required = schema.required || [];
      required.forEach((field) => {
        if (value[field] === undefined) {
          errors.push(`${path}.${field} is required`);
        }
      });

      if (schema.properties) {
        Object.keys(schema.properties).forEach((field) => {
          if (value[field] === undefined) {
            return;
          }
          errors.push(
            ...this.validateAgainstSchema(
              value[field],
              schema.properties?.[field] as MinimalJsonSchema,
              `${path}.${field}`,
            ),
          );
        });
      }
    }

    return errors;
  }

  private detectJsonType(value: any): JsonSchemaType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') {
      return t as JsonSchemaType;
    }
    return 'null';
  }

  private mergeFallbackExtraction(
    item: CrawlerCampItemDto,
    extraction: CampInfoExtraction,
    reasons: string[],
  ): CrawlerCampItemDto {
    const next: CrawlerCampItemDto = { ...item };

    if (!this.normalizeText(next.title, 300) && extraction.title) {
      next.title = extraction.title;
    }

    if (
      reasons.includes('announcement_type_conflict') &&
      extraction.announcementType
    ) {
      next.announcementType = extraction.announcementType;
    }

    if (!next.publishDate && extraction.publishDate) {
      next.publishDate = extraction.publishDate;
    }
    if (!next.deadline && extraction.deadline) {
      next.deadline = extraction.deadline;
    }
    if (!next.startDate && extraction.startDate) {
      next.startDate = extraction.startDate;
    }
    if (!next.endDate && extraction.endDate) {
      next.endDate = extraction.endDate;
    }

    if (this.isStructuredEmpty(next.requirements) && !this.isStructuredEmpty(extraction.requirements)) {
      next.requirements = extraction.requirements;
    }
    if (this.isStructuredEmpty(next.materials) && !this.isStructuredEmpty(extraction.materials)) {
      next.materials = extraction.materials;
    }
    if (this.isStructuredEmpty(next.process) && !this.isStructuredEmpty(extraction.process)) {
      next.process = extraction.process;
    }
    if (this.isStructuredEmpty((next as any).contact) && !this.isStructuredEmpty(extraction.contact)) {
      (next as any).contact = extraction.contact;
    }

    next.confidence = Math.max(
      this.normalizeConfidence(item.confidence),
      this.normalizeConfidence(extraction.confidence),
    );

    return next;
  }

  private hasAnnouncementTypeConflict(item: CrawlerCampItemDto): boolean {
    const raw = this.normalizeText(item?.announcementType, 40);
    if (!raw) {
      return false;
    }
    const explicit = this.normalizeAnnouncementType(raw);
    const inferred = this.inferAnnouncementTypeFromText(
      `${item?.title || ''} ${item?.sourceUrl || ''} ${item?.content || ''}`,
    );
    return Boolean(inferred && inferred !== explicit);
  }

  private inferAnnouncementTypeFromText(text: string): '' | 'summer_camp' | 'pre_recommendation' {
    const source = String(text || '').toLowerCase();
    if (!source.trim()) {
      return '';
    }
    if (/预推免|推免生|推荐免试|tuimian|recommendation/.test(source)) {
      return 'pre_recommendation';
    }
    if (/夏令营|暑期学校|summer/.test(source)) {
      return 'summer_camp';
    }
    return '';
  }

  private isStructuredEmpty(value: any): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return true;
      }
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return this.isStructuredEmpty(JSON.parse(trimmed));
        } catch {
          return false;
        }
      }
      return false;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length === 0;
    }
    return false;
  }

  private extractSourceSnippet(content: string): string {
    const maxLength = this.getSnippetMaxLength();
    const text = this.normalizeText((content || '').replace(/\s+/g, ' '), maxLength);
    return text || '';
  }

  private isDeepSeekFallbackEnabled(): boolean {
    const raw = this.configService.get<string>('DEEPSEEK_FALLBACK_ENABLED', 'false');
    return String(raw).toLowerCase() === 'true';
  }

  private getDeepSeekMinConfidence(): number {
    const raw = Number(this.configService.get<string>('DEEPSEEK_FALLBACK_MIN_CONFIDENCE', '0.75'));
    if (!Number.isFinite(raw)) {
      return 0.75;
    }
    if (raw < 0) return 0;
    if (raw > 1) return 1;
    return raw;
  }

  private getDeepSeekExtractionVersion(): string {
    return this.configService.get<string>('DEEPSEEK_EXTRACTION_VERSION', FALLBACK_EXTRACTION_VERSION);
  }

  private getDeepSeekModel(): string {
    return this.configService.get<string>('DEEPSEEK_MODEL', 'deepseek-chat');
  }

  private getSnippetMaxLength(): number {
    const raw = Number(this.configService.get<string>('DEEPSEEK_SOURCE_SNIPPET_MAX_LENGTH', `${DEFAULT_SNIPPET_MAX_LENGTH}`));
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_SNIPPET_MAX_LENGTH;
    }
    return Math.min(raw, 4000);
  }

  private normalizeDateString(value?: string): string | undefined {
    if (!value) return undefined;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      return undefined;
    }
    return dt.toISOString();
  }

  private normalizeStructuredForItem(value: any, fallback: Record<string, any>): Record<string, any> {
    if (!value) return fallback;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return fallback;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        return fallback;
      } catch {
        return fallback;
      }
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    return fallback;
  }

  private normalizeStructuredArrayForItem(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== '');
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => item !== null && item !== undefined && String(item).trim() !== '');
        }
      } catch {
        // noop
      }
      return trimmed
        .split(/[\n；;,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private resolveUniversityNameHint(item: CrawlerCampItemDto): string {
    return this.normalizeText(item?.universityId, 120) || '未知院校';
  }

  private buildExtractionHint(item: CrawlerCampItemDto): Record<string, any> {
    return {
      announcementType: this.normalizeText(item?.announcementType, 40),
      title: this.normalizeText(item?.title, 300),
      publishDate: this.normalizeDateString(item?.publishDate),
      deadline: this.normalizeDateString(item?.deadline),
      startDate: this.normalizeDateString(item?.startDate),
      endDate: this.normalizeDateString(item?.endDate),
      requirements: this.normalizeStructuredForItem(item?.requirements, {}),
      materials: this.normalizeStructuredArrayForItem(item?.materials),
      process: this.normalizeStructuredArrayForItem(item?.process),
      contact: this.normalizeStructuredForItem((item as any)?.contact, {}),
    };
  }

  private async createExtractionLog(params: {
    item: CrawlerCampItemDto;
    reasons: string[];
    snippet: string;
    status: 'success' | 'fallback' | 'error' | 'invalid';
    errorMessage?: string;
    requestPayload?: any;
    responsePayload?: any;
    parsedResult?: any;
    confidenceScore?: number;
  }): Promise<string | undefined> {
    try {
      const log = await this.prisma.campExtractionLog.create({
        data: {
          campId: null,
          universityId: this.normalizeText(params.item.universityId, 100),
          sourceUrl: this.normalizeText(params.item.sourceUrl, 500),
          triggerReasons: JSON.stringify(params.reasons || []),
          sourceSnippet: this.limitText(params.snippet || '', this.getSnippetMaxLength()) || null,
          provider: 'deepseek',
          model: this.getDeepSeekModel(),
          extractionVersion: this.getDeepSeekExtractionVersion(),
          confidenceScore: params.confidenceScore ?? null,
          requestPayload: params.requestPayload ? this.limitText(this.safeStringify(params.requestPayload), 2000) : null,
          responsePayload: params.responsePayload ? this.limitText(this.safeStringify(params.responsePayload), 4000) : null,
          parsedResult: params.parsedResult ? this.limitText(this.safeStringify(params.parsedResult), 4000) : null,
          status: params.status,
          errorMessage: params.errorMessage ? this.limitText(params.errorMessage, 500) : null,
        },
      });
      return log.id;
    } catch (error) {
      this.logger.warn(`记录 extraction log 失败: ${error?.message || error}`);
      return undefined;
    }
  }

  private async bindExtractionLogToCamp(logId?: string, campId?: string) {
    if (!logId || !campId) {
      return;
    }
    try {
      await this.prisma.campExtractionLog.update({
        where: { id: logId },
        data: { campId },
      });
    } catch (error) {
      this.logger.warn(`关联 extraction log 与 camp 失败 logId=${logId} campId=${campId}: ${error?.message || error}`);
    }
  }

  private safeStringify(value: any): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private async buildExportFilePath(taskId: string) {
    const outputDir = path.resolve(this.crawlerPath, '.crawl-exports');
    await fs.mkdir(outputDir, { recursive: true });
    return path.join(outputDir, `task-${taskId}.jl`);
  }

  private applyCompatibilitySettings(args: string[]) {
    // 仓库当前缺少自定义 pipelines/middlewares/scheduler 的实现，运行时回退到 Scrapy 默认配置。
    args.push('-s', 'ITEM_PIPELINES={}');
    args.push('-s', 'DOWNLOADER_MIDDLEWARES={}');
    args.push('-s', 'SPIDER_MIDDLEWARES={}');
    args.push('-s', 'EXTENSIONS={}');
    args.push('-s', 'SCHEDULER=scrapy.core.scheduler.Scheduler');
    args.push('-s', 'DUPEFILTER_CLASS=scrapy.dupefilters.RFPDupeFilter');
  }

  private async ingestFromExportFile(exportFilePath: string) {
    try {
      const content = await fs.readFile(exportFilePath, 'utf8');
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return {
          processed: 0,
          created: 0,
          updated: 0,
          unchanged: 0,
          skipped: 0,
          eventsCreated: 0,
          errors: [],
        };
      }

      const items: CrawlerCampItemDto[] = [];
      const parseErrors: Array<{ index: number; reason: string }> = [];
      for (let index = 0; index < lines.length; index += 1) {
        try {
          items.push(JSON.parse(lines[index]));
        } catch (error) {
          parseErrors.push({
            index,
            reason: `JSON 解析失败: ${error?.message || 'unknown'}`,
          });
        }
      }

      const summary = await this.ingestCamps(items, {
        emitBaselineEvents: true,
        sourceType: 'crawler',
      });
      return {
        ...summary,
        errors: [...parseErrors, ...summary.errors],
      };
    } catch (error) {
      this.logger.warn(`读取爬虫导出文件失败: ${exportFilePath}, ${error?.message || error}`);
      return {
        processed: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        eventsCreated: 0,
        errors: [
          {
            index: -1,
            reason: error?.message || '导出文件读取失败',
          },
        ],
      };
    }
  }

  private isCampItemValid(item: CrawlerCampItemDto) {
    const title = this.normalizeText(item?.title, 300);
    const sourceUrl = this.normalizeText(item?.sourceUrl, 500);
    const universityId = this.normalizeText(item?.universityId, 100);
    return Boolean(title && sourceUrl && universityId);
  }

  private toCampWriteData(item: CrawlerCampItemDto) {
    const normalizedTitle = this.normalizeText(item.title, 300);
    const normalizedAnnouncementType = this.normalizeAnnouncementType(item.announcementType);
    const normalizedUniversityId = this.normalizeText(item.universityId, 100);
    const normalizedSourceUrl = this.normalizeText(item.sourceUrl, 500);

    return {
      title: normalizedTitle,
      announcementType: normalizedAnnouncementType,
      identityHash: this.computeCampIdentityHash({
        universityId: normalizedUniversityId,
        announcementType: normalizedAnnouncementType,
        title: normalizedTitle,
        publishDate: item.publishDate,
        deadline: item.deadline,
        startDate: item.startDate,
        endDate: item.endDate,
      }),
      identityVersion: 1,
      sourceUrl: normalizedSourceUrl,
      universityId: normalizedUniversityId,
      publishDate: this.toDate(item.publishDate),
      deadline: this.toDate(item.deadline),
      startDate: this.toDate(item.startDate),
      endDate: this.toDate(item.endDate),
      requirements: this.serializeStructured(item.requirements),
      materials: this.serializeStructured(item.materials),
      process: this.serializeStructured(item.process),
      contact: this.serializeStructured(item.contact),
      confidence: this.normalizeConfidence(item.confidence),
      status: 'published',
    };
  }

  private async findExistingCampByIdentityOrAlias(writeData: any) {
    if (writeData.identityHash) {
      const byIdentity = await this.prisma.campInfo.findFirst({
        where: {
          universityId: writeData.universityId,
          identityHash: writeData.identityHash,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (byIdentity) {
        return byIdentity;
      }
    }

    const urlHash = this.computeSourceUrlHash(writeData.sourceUrl);
    if (urlHash) {
      const alias = await this.prisma.campSourceAlias.findUnique({
        where: {
          universityId_sourceUrlHash: {
            universityId: writeData.universityId,
            sourceUrlHash: urlHash,
          },
        },
        include: {
          camp: true,
        },
      });
      if (alias?.camp) {
        return alias.camp;
      }
    }

    return this.prisma.campInfo.findFirst({
      where: {
        sourceUrl: writeData.sourceUrl,
        universityId: writeData.universityId,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async upsertCampAlias(
    campId: string,
    universityId: string,
    sourceUrl: string,
    isPrimary: boolean = true,
  ) {
    const sourceUrlHash = this.computeSourceUrlHash(sourceUrl);
    if (!sourceUrlHash) {
      return;
    }
    if (isPrimary) {
      await this.prisma.campSourceAlias.updateMany({
        where: {
          campId,
          isPrimary: true,
          sourceUrlHash: { not: sourceUrlHash },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    await this.prisma.campSourceAlias.upsert({
      where: {
        universityId_sourceUrlHash: {
          universityId,
          sourceUrlHash,
        },
      },
      create: {
        campId,
        universityId,
        sourceUrl,
        sourceUrlHash,
        isPrimary,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      update: {
        campId,
        sourceUrl,
        isPrimary,
        lastSeenAt: new Date(),
      },
    });
  }

  private normalizeAnnouncementType(value?: string) {
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'pre_recommendation' ? 'pre_recommendation' : 'summer_camp';
  }

  private normalizeConfidence(value?: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0.76;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return Number(value.toFixed(2));
  }

  private normalizeText(value?: string, maxLength: number = 500) {
    if (!value) {
      return '';
    }
    const text = String(value).trim();
    if (!text) {
      return '';
    }
    return text.length <= maxLength ? text : text.slice(0, maxLength);
  }

  private toDate(value?: string) {
    if (!value) {
      return null;
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    return dt;
  }

  private formatDate(value: Date | null | undefined) {
    if (!value) {
      return '';
    }
    return value.toISOString();
  }

  private serializeStructured(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      try {
        return this.stableStringify(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }

    return this.stableStringify(value);
  }

  private stableStringify(value: any): string {
    const normalize = (input: any): any => {
      if (Array.isArray(input)) {
        return input.map((item) => normalize(item));
      }
      if (input && typeof input === 'object') {
        const obj: Record<string, any> = {};
        Object.keys(input)
          .sort()
          .forEach((key) => {
            obj[key] = normalize(input[key]);
          });
        return obj;
      }
      return input;
    };

    return JSON.stringify(normalize(value));
  }

  private normalizeForCompare(value: any, fieldName: string): string {
    if (!value) {
      return '';
    }

    if (fieldName.endsWith('Date')) {
      if (value instanceof Date) {
        return this.formatDate(value);
      }
      const dt = new Date(value);
      if (!Number.isNaN(dt.getTime())) {
        return this.formatDate(dt);
      }
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return this.stableStringify(JSON.parse(trimmed));
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }

    if (value instanceof Date) {
      return this.formatDate(value);
    }

    if (typeof value === 'object') {
      return this.stableStringify(value);
    }

    return String(value);
  }

  private computeCampIdentityHash(payload: {
    universityId: string;
    announcementType: string;
    title: string;
    publishDate?: string;
    deadline?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const normalizedTitle = (payload.title || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[【】[\]()（）_-]/g, '');
    const year = this.extractBestYear(payload);
    const raw = [
      payload.universityId || '',
      payload.announcementType || '',
      normalizedTitle,
      year,
    ].join('|');
    if (!raw.replace(/\|/g, '')) {
      return null;
    }
    return this.hashText(raw);
  }

  private extractBestYear(payload: {
    publishDate?: string;
    deadline?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const candidates = [payload.publishDate, payload.deadline, payload.startDate, payload.endDate];
    for (const value of candidates) {
      if (!value) continue;
      const match = String(value).match(/(20\d{2})/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  private computeSourceUrlHash(sourceUrl: string) {
    if (!sourceUrl) {
      return '';
    }
    const normalized = sourceUrl.trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return this.hashText(normalized);
  }

  private hashText(input: string) {
    return createHash('sha256').update(input).digest('hex');
  }

  private diffCamp(existing: any, incoming: any): CampDiffField[] {
    const diffs: CampDiffField[] = [];
    Object.keys(TRACKED_FIELD_EVENT_MAP).forEach((fieldName) => {
      const oldValue = this.normalizeForCompare(existing[fieldName], fieldName);
      const newValue = this.normalizeForCompare(incoming[fieldName], fieldName);
      if (oldValue === newValue) {
        return;
      }
      diffs.push({
        fieldName,
        eventType: TRACKED_FIELD_EVENT_MAP[fieldName],
        oldValue,
        newValue,
      });
    });
    return diffs;
  }

  private buildBaselineEvents(data: any): CampDiffField[] {
    const events: CampDiffField[] = [];
    Object.keys(TRACKED_FIELD_EVENT_MAP).forEach((fieldName) => {
      const newValue = this.normalizeForCompare(data[fieldName], fieldName);
      if (!newValue) {
        return;
      }
      events.push({
        fieldName,
        eventType: TRACKED_FIELD_EVENT_MAP[fieldName],
        oldValue: '',
        newValue,
      });
    });
    return events;
  }

  private resolveSourceUpdatedAt(item: CrawlerCampItemDto) {
    if (item?.crawlTime) {
      const dt = new Date(item.crawlTime);
      if (!Number.isNaN(dt.getTime())) {
        return dt;
      }
    }
    return new Date();
  }

  private async createChangeEvents(
    campId: string,
    fields: CampDiffField[],
    sourceType: string,
    sourceUrl: string,
    sourceUpdatedAt: Date,
    sourceSnippet?: string,
  ) {
    let createdCount = 0;
    for (const diff of fields) {
      try {
        await this.progressService.createChangeEvent({
          campId,
          eventType: diff.eventType,
          fieldName: diff.fieldName,
          oldValue: this.limitText(diff.oldValue, 500) || undefined,
          newValue: this.limitText(diff.newValue, 500) || undefined,
          sourceType,
          sourceUrl,
          sourceUpdatedAt: sourceUpdatedAt.toISOString(),
          sourceSnippet: sourceSnippet || undefined,
        });
        createdCount += 1;
      } catch (error) {
        this.logger.warn(
          `创建 ProgressChangeEvent 失败 campId=${campId} field=${diff.fieldName}: ${error?.message || error}`,
        );
      }
    }
    return createdCount;
  }

  private inferResultEventTypeFromItem(item: CrawlerCampItemDto): ProgressEventType | null {
    const text = `${item?.title || ''}\n${item?.content || ''}`.toLowerCase();
    if (!text.trim()) return null;
    if (/(优秀营员|优营名单|优秀营员结果|推免资格|拟录取)/i.test(text)) {
      return 'outstanding_result';
    }
    if (/(入营名单|入营结果|入选名单|入围名单|面试名单)/i.test(text)) {
      return 'admission_result';
    }
    return null;
  }

  private async emitInferredResultEvent(
    campId: string,
    item: CrawlerCampItemDto,
    sourceType: string,
    sourceUrl: string,
    sourceUpdatedAt: Date,
  ) {
    const eventType = this.inferResultEventTypeFromItem(item);
    if (!eventType) return 0;
    const sourceSnippet = this.extractSourceSnippet(item?.content || item?.title || '');
    const newValue = this.limitText(item?.content || item?.title || '', 500);
    if (!newValue) return 0;
    try {
      await this.progressService.createChangeEvent({
        campId,
        eventType,
        fieldName: 'result_notice',
        oldValue: '',
        newValue,
        sourceType,
        sourceUrl,
        sourceUpdatedAt: sourceUpdatedAt.toISOString(),
        sourceSnippet,
      });
      return 1;
    } catch (error) {
      this.logger.warn(
        `创建推断结果事件失败 campId=${campId} type=${eventType}: ${error?.message || error}`,
      );
      return 0;
    }
  }

  private limitText(value: string, maxLength: number) {
    if (!value) {
      return '';
    }
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
  }

  /**
   * 获取爬虫日志
   */
  async getLogs() {
    return this.prisma.crawlerLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 获取任务状态
   * 支持通过taskId（内存任务ID）或logId（数据库记录ID）查询
   */
  async getTaskStatus(taskId: string) {
    // 首先尝试从内存中获取活跃任务
    const task = this.activeTasks.get(taskId);
    if (task) {
      return {
        taskId: task.id,
        logId: task.logId,
        status: task.status,
        startTime: task.startTime,
        endTime: task.endTime,
        result: task.result,
        error: task.error,
      };
    }

    // 从数据库查询历史任务
    const log = await this.prisma.crawlerLog.findFirst({
      where: { id: taskId },
    });
    if (!log) {
      throw new BadRequestException('任务不存在');
    }
    return {
      taskId: log.id,
      logId: log.id,
      status: log.status,
      universityId: log.universityId,
      itemsCount: log.itemsCount,
      errorMsg: log.errorMsg,
      createdAt: log.createdAt,
      startTime: log.startTime,
      endTime: log.endTime,
    };
  }
}
