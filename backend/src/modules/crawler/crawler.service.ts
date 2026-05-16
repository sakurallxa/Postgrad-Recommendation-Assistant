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
  mode: 'fallback' | 'compare';
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
  publishDate: 'deadline',
  deadline: 'deadline',
  startDate: 'deadline',
  endDate: 'deadline',
};

const LOW_VALUE_TITLES = new Set(['夏令营', '夏令营/推免', '推免', '预推免', '推荐免试']);
const BLOCKED_NOTICE_KEYWORDS = [
  '博士',
  '申请考核',
  '申请-考核',
  '港澳台',
  '成绩查询',
  '考前提醒',
  '报名须知',
  '专业目录',
];
const TITLE_PREFIX_LABELS = [
  '学工动态',
  '工作动态',
  '医学教育',
  '通知公告',
  '新闻动态',
  '招生信息',
  '招生通知',
];
const TITLE_SUFFIX_LABELS = ['学工动态', '工作动态', '医学教育', '通知公告', '新闻动态'];

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
      const scrapyCmd = process.env.SCRAPY_COMMAND || 'python3';
      const scrapyArgs =
        process.env.SCRAPY_COMMAND && process.env.SCRAPY_COMMAND !== 'python3'
          ? args
          : ['-m', 'scrapy', ...args];
      const options = {
        cwd: this.crawlerPath,
        env: {
          ...process.env,
          PYTHONPATH: this.crawlerPath,
        },
      };

      this.logger.log(`执行命令: ${scrapyCmd} ${scrapyArgs.join(' ')}`);

      const child = spawn(scrapyCmd, scrapyArgs, options);
      
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

  /**
   * 一次性：失效所有用户的 CampMatchResult 并重跑 LLM 匹配。
   *
   * 重要：rematch 范围 = 用户**所有现存 match** 的 campIds（不只是当前订阅的 dept）
   * 这样可以覆盖：
   *   - 用户当前订阅 dept 下的 camp
   *   - 用户已收藏但后来取消订阅的 camp
   *   - 通过 university-level orphan 匹配进来的 camp
   *   - 历史上任何被生成过 match 但用户现在不订阅的 camp
   * 比之前的"按订阅范围"逻辑更彻底。
   */
  async rematchAllUsers(): Promise<{
    users: number;
    totalDeleted: number;
    totalReMatched: number;
  }> {
    const profiles = await this.prisma.userProfile.findMany({ select: { userId: true } });
    let users = 0;
    let totalDeleted = 0;
    let totalReMatched = 0;
    const { MatchSchedulerSingleton } = require('../crawl-job/match-scheduler');
    const matchScheduler = MatchSchedulerSingleton(this.prisma, this.configService, this.logger);
    for (const prof of profiles) {
      const userId = prof.userId;

      // 1) 用户所有现存的 match
      const existing = await this.prisma.campMatchResult.findMany({
        where: { userId },
        select: { campId: true },
      });
      const fromExistingMatches = new Set(existing.map((m) => m.campId));

      // 2) 用户当前订阅 dept 对应的 camp（含 university-level orphan）—— 覆盖"档案更新后想看新公告"的场景
      const subs = await this.prisma.userDepartmentSubscription.findMany({
        where: { userId, active: true },
        select: { departmentId: true },
      });
      const deptIds = subs.map((s) => s.departmentId);
      let fromSubsCamps: { id: string }[] = [];
      if (deptIds.length > 0) {
        const depts = await this.prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { universityId: true },
        });
        const universityIds = Array.from(new Set(depts.map((d) => d.universityId)));
        fromSubsCamps = await this.prisma.campInfo.findMany({
          where: {
            OR: [
              { departmentId: { in: deptIds } },
              { AND: [{ departmentId: null }, { universityId: { in: universityIds } }] },
            ],
          },
          select: { id: true },
        });
      }

      // 3) 合并去重
      const allCampIds = new Set<string>([
        ...fromExistingMatches,
        ...fromSubsCamps.map((c) => c.id),
      ]);
      if (allCampIds.size === 0) continue;
      const campIds = Array.from(allCampIds);

      // 4) 删除旧 match + 调度新匹配
      const r = await this.prisma.campMatchResult.deleteMany({
        where: { userId, campId: { in: campIds } },
      });
      await matchScheduler.scheduleMatchingForUser(userId, campIds);
      users++;
      totalDeleted += r.count;
      totalReMatched += campIds.length;
      this.logger.log(
        `[rematch-all] user=${userId.slice(0, 8)} fromExisting=${fromExistingMatches.size} fromSubs=${fromSubsCamps.length} total=${campIds.length} deleted=${r.count}`,
      );
    }
    return { users, totalDeleted, totalReMatched };
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
      llmCompared: 0,
      llmMerged: 0,
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
    summary: {
      llmTriggered: number;
      llmCompared: number;
      llmMerged: number;
      llmSuccess: number;
      llmFailed: number;
    },
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
    if (decision.mode === 'compare') {
      summary.llmCompared += 1;
    }

    if (!this.isDeepSeekExtractionEnabled()) {
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
    const structuredSource = this.buildStructuredExtractionSource(item?.content || '');
    const requestPayload = {
      universityId: item.universityId,
      sourceUrl: item.sourceUrl,
      reasons: decision.reasons,
      hint,
      structuredSource,
    };

    try {
      const extraction = await this.deepSeekService.extractCampInfo(
        structuredSource || content,
        this.resolveUniversityNameHint(item),
        hint,
      );
      const extractionWithDefaults = extraction
        ? {
            ...extraction,
            title: this.normalizeText(extraction.title, 300) || this.normalizeText(item.title, 300),
          }
        : extraction;
      const validated = this.validateExtractionSchema(extractionWithDefaults);
      if (!validated.valid || !validated.data) {
        summary.llmFailed += 1;
        const logId = await this.createExtractionLog({
          item,
          reasons: decision.reasons,
          snippet: decision.snippet,
          status: 'invalid',
          errorMessage: validated.reason || 'schema_invalid',
          requestPayload,
          responsePayload: extractionWithDefaults || null,
          parsedResult: {
            mode: decision.mode,
            ruleResult: hint,
            llmResult: extractionWithDefaults || null,
          },
        });
        return {
          item,
          used: true,
          success: false,
          reasons: decision.reasons,
          snippet: decision.snippet,
          extraction: extractionWithDefaults || extraction,
          error: validated.reason || 'schema_invalid',
          logId,
        };
      }

      const mergeResult = this.mergeFallbackExtraction(
        item,
        validated.data,
        decision.reasons,
        decision.mode,
      );
      const mergedItem = mergeResult.item;
      if (mergeResult.mergeReasons.length > 0) {
        summary.llmMerged += 1;
      }
      summary.llmSuccess += 1;
      const logId = await this.createExtractionLog({
        item: mergedItem,
        reasons: decision.reasons,
        snippet: decision.snippet,
        status: 'success',
        requestPayload,
        responsePayload: extractionWithDefaults || null,
        parsedResult: {
          mode: decision.mode,
          ruleResult: hint,
          llmResult: validated.data,
          mergedResult: this.buildExtractionHint(mergedItem),
          mergeReasons: mergeResult.mergeReasons,
        },
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
    const compareEnabled = this.isDeepSeekCompareEnabled();
    const forceStructured = this.isDeepSeekForceStructuredEnabled();
    const confidence = this.normalizeConfidence(item?.confidence);
    if (confidence < this.getDeepSeekMinConfidence()) {
      reasons.push('low_confidence');
    }

    if (this.isStructuredEmpty(item?.materials)) {
      reasons.push('empty_materials');
    }
    if (this.hasLowQualityMaterials(item?.materials)) {
      reasons.push('low_quality_materials');
    }
    if (this.isStructuredEmpty(item?.process)) {
      reasons.push('empty_process');
    }
    if (this.hasLowQualityProcess(item?.process)) {
      reasons.push('low_quality_process');
    }
    if (this.isStructuredEmpty(item?.requirements)) {
      reasons.push('missing_requirements');
    }
    if (this.hasLowQualityRequirements(item?.requirements)) {
      reasons.push('low_quality_requirements');
    }

    // publishDate is metadata, not event time — exclude it from event-time check
    const hasEventTime = Boolean(item?.deadline || item?.startDate || item?.endDate);
    if (!hasEventTime) {
      reasons.push('missing_time_fields');
    }
    // Deadline is the most actionable field — trigger LLM whenever rule extraction missed it
    if (!item?.deadline) {
      reasons.push('missing_deadline');
    }
    // For summer camps, users need the actual camp dates (start/end)
    if (item?.announcementType === 'summer_camp' && !item?.startDate && !item?.endDate) {
      reasons.push('missing_camp_dates');
    }

    if (this.hasAnnouncementTypeConflict(item)) {
      reasons.push('announcement_type_conflict');
    }
    if (forceStructured) {
      reasons.push('force_structured_extraction');
    }

    const snippet = this.extractSourceSnippet(this.buildStructuredExtractionSource(item?.content || '') || item?.content || '');
    return {
      shouldExtract: forceStructured || compareEnabled || reasons.length > 0,
      mode: compareEnabled ? 'compare' : 'fallback',
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

    const cleanedTitle = this.cleanCampTitle(extraction.title, 300);
    if (!cleanedTitle) {
      return { valid: false, reason: 'invalid_title' };
    }
    if (this.isLowValueTitle(cleanedTitle) || this.containsBlockedNoticeSignal(cleanedTitle)) {
      return { valid: false, reason: 'blocked_title' };
    }

    const announcementType = this.normalizeAnnouncementType(extraction.announcementType);
    const confidence = this.normalizeConfidence(extraction.confidence);
    if (confidence <= 0) {
      return { valid: false, reason: 'invalid_confidence' };
    }

    const requirements = this.sanitizeRequirements(
      this.normalizeStructuredForItem(extraction.requirements, {}),
    );
    const materials = this.sanitizeMaterials(
      this.normalizeStructuredArrayForItem(extraction.materials),
    );
    const process = this.sanitizeProcess(
      this.normalizeStructuredArrayForItem(extraction.process),
    );
    const contact = this.sanitizeContact(
      this.normalizeStructuredForItem(extraction.contact, {}),
    );

    return {
      valid: true,
      data: {
        ...extraction,
        title: cleanedTitle,
        announcementType,
        publishDate: this.normalizeDateString(extraction.publishDate),
        deadline: this.normalizeDateString(extraction.deadline),
        startDate: this.normalizeDateString(extraction.startDate),
        endDate: this.normalizeDateString(extraction.endDate),
        location: this.sanitizeLocation(this.normalizeText(extraction.location, 160)),
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
    mode: 'fallback' | 'compare',
  ): { item: CrawlerCampItemDto; mergeReasons: string[] } {
    const next: CrawlerCampItemDto = { ...item };
    const mergeReasons: string[] = [];
    const ruleHint = this.buildExtractionHint(item);
    const llmHint = this.buildExtractionHint(extraction as any);

    if (
      (!this.normalizeText(next.title, 300) || this.isLowValueTitle(this.normalizeText(next.title, 300))) &&
      extraction.title
    ) {
      next.title = extraction.title;
      mergeReasons.push('title_from_llm');
    }

    if (
      (mode === 'compare' || reasons.includes('announcement_type_conflict')) &&
      extraction.announcementType
    ) {
      next.announcementType = extraction.announcementType;
      mergeReasons.push('announcement_type_from_llm');
    }

    if (!next.publishDate && extraction.publishDate) {
      next.publishDate = extraction.publishDate;
      mergeReasons.push('publish_date_from_llm');
    }
    if (!next.deadline && extraction.deadline) {
      next.deadline = extraction.deadline;
      mergeReasons.push('deadline_from_llm');
    }
    if (!next.startDate && extraction.startDate) {
      next.startDate = extraction.startDate;
      mergeReasons.push('start_date_from_llm');
    }
    if (!next.endDate && extraction.endDate) {
      next.endDate = extraction.endDate;
      mergeReasons.push('end_date_from_llm');
    }
    if (!this.normalizeText((next as any).location, 160) && llmHint.location) {
      (next as any).location = llmHint.location;
      mergeReasons.push('location_from_llm');
    }

    const forceStructured = reasons.includes('force_structured_extraction');
    const shouldReplaceRequirements =
      forceStructured || reasons.includes('low_quality_requirements');
    const shouldReplaceMaterials =
      forceStructured || reasons.includes('low_quality_materials');
    const shouldReplaceProcess =
      forceStructured ||
      reasons.includes('low_quality_process') ||
      this.shouldReplaceProcessWithStructuredResult(next.process, extraction.process);

    if ((this.isStructuredEmpty(next.requirements) || shouldReplaceRequirements) && !this.isStructuredEmpty(extraction.requirements)) {
      next.requirements = extraction.requirements;
      mergeReasons.push(shouldReplaceRequirements ? 'requirements_replaced_from_llm' : 'requirements_from_llm');
    } else if (mode === 'compare' && !this.isStructuredEmpty(extraction.requirements)) {
      next.requirements = {
        ...this.normalizeStructuredForItem(next.requirements, {}),
        ...this.normalizeStructuredForItem(extraction.requirements, {}),
      };
      mergeReasons.push('requirements_merged');
    }
    if ((this.isStructuredEmpty(next.materials) || shouldReplaceMaterials) && !this.isStructuredEmpty(extraction.materials)) {
      next.materials = extraction.materials;
      mergeReasons.push(shouldReplaceMaterials ? 'materials_replaced_from_llm' : 'materials_from_llm');
    } else if (mode === 'compare' && !this.isStructuredEmpty(extraction.materials)) {
      next.materials = this.mergeStructuredArrayItems(next.materials, extraction.materials);
      mergeReasons.push('materials_merged');
    }
    if ((this.isStructuredEmpty(next.process) || shouldReplaceProcess) && !this.isStructuredEmpty(extraction.process)) {
      next.process = extraction.process;
      mergeReasons.push(shouldReplaceProcess ? 'process_replaced_from_llm' : 'process_from_llm');
    } else if (mode === 'compare' && !this.isStructuredEmpty(extraction.process)) {
      next.process = this.mergeStructuredArrayItems(next.process, extraction.process);
      mergeReasons.push('process_merged');
    }
    if (this.isStructuredEmpty((next as any).contact) && !this.isStructuredEmpty(extraction.contact)) {
      (next as any).contact = extraction.contact;
      mergeReasons.push('contact_from_llm');
    } else if (mode === 'compare' && !this.isStructuredEmpty(extraction.contact)) {
      (next as any).contact = {
        ...this.normalizeStructuredForItem((next as any).contact, {}),
        ...this.normalizeStructuredForItem(extraction.contact, {}),
      };
      mergeReasons.push('contact_merged');
    }

    next.confidence = Math.max(
      this.normalizeConfidence(item.confidence),
      this.normalizeConfidence(extraction.confidence),
    );

    return { item: next, mergeReasons };
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

  private buildStructuredExtractionSource(content: string): string {
    const source = String(content || '').trim();
    if (!source) {
      return '';
    }
    const sections = [
      { label: '申请条件', block: this.extractLabeledSection(source, ['申请条件', '报名条件', '申请资格', '报名资格']) },
      { label: '申请材料', block: this.extractLabeledSection(source, ['申请材料', '报名材料', '提交材料', '材料提交']) },
      { label: '流程安排', block: this.extractLabeledSection(source, ['申请流程', '报名流程', '选拔流程', '工作流程', '申请程序']) },
      { label: '联系方式', block: this.extractLabeledSection(source, ['联系方式', '联系人', '咨询电话', '联系电话', '联系邮箱']) },
    ].filter((item) => item.block);

    if (sections.length === 0) {
      return this.extractSourceSnippet(source);
    }

    return this.extractSourceSnippet(
      sections
        .map((item) => `${item.label}：\n${item.block}`)
        .join('\n\n'),
    );
  }

  private extractLabeledSection(content: string, labels: string[]): string {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = content.match(
        new RegExp(`${escaped}[：:]?\\s*([\\s\\S]{0,900}?)(?=(?:\\n\\s*(?:申请条件|报名条件|申请资格|报名资格|申请材料|报名材料|提交材料|材料提交|申请流程|报名流程|选拔流程|工作流程|申请程序|联系方式|联系人|咨询电话|联系电话|联系邮箱)[：:])|$)`, 'u'),
      );
      const block = this.normalizeText(match?.[1] || '', 900);
      if (block) {
        return block;
      }
    }
    return '';
  }

  private isDeepSeekFallbackEnabled(): boolean {
    const raw = this.configService.get<string>('DEEPSEEK_FALLBACK_ENABLED', 'false');
    return String(raw).toLowerCase() === 'true';
  }

  private isDeepSeekCompareEnabled(): boolean {
    const raw = this.configService.get<string>('DEEPSEEK_COMPARE_ENABLED', 'true');
    return String(raw).toLowerCase() === 'true';
  }

  private isDeepSeekForceStructuredEnabled(): boolean {
    const raw = this.configService.get<string>('DEEPSEEK_FORCE_STRUCTURED_ENABLED', 'true');
    return String(raw).toLowerCase() === 'true';
  }

  private isDeepSeekExtractionEnabled(): boolean {
    return (
      this.isDeepSeekFallbackEnabled() ||
      this.isDeepSeekCompareEnabled() ||
      this.isDeepSeekForceStructuredEnabled()
    );
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
      location: this.sanitizeLocation(this.normalizeText((item as any)?.location, 160)),
      requirements: this.sanitizeRequirements(this.normalizeStructuredForItem(item?.requirements, {})),
      materials: this.sanitizeMaterials(this.normalizeStructuredArrayForItem(item?.materials)),
      process: this.sanitizeProcess(this.normalizeStructuredArrayForItem(item?.process)),
      contact: this.sanitizeContact(this.normalizeStructuredForItem((item as any)?.contact, {})),
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
    const title = this.cleanCampTitle(item?.title, 300);
    const sourceUrl = this.normalizeText(item?.sourceUrl, 500);
    const universityId = this.normalizeText(item?.universityId, 100);
    const mergedText = this.normalizeText(
      [title, sourceUrl, item?.announcementType || ''].filter(Boolean).join(' '),
      1200,
    );
    return Boolean(
      title &&
        sourceUrl &&
        universityId &&
        !this.isSystemLikeTitle(title) &&
        !this.isLowValueTitle(title) &&
        !this.containsBlockedNoticeSignal(mergedText),
    );
  }

  private toCampWriteData(item: CrawlerCampItemDto) {
    const normalizedTitle = this.cleanCampTitle(item.title, 300);
    const normalizedAnnouncementType = this.normalizeAnnouncementType(item.announcementType);
    const normalizedUniversityId = this.normalizeText(item.universityId, 100);
    const normalizedSourceUrl = this.normalizeText(item.sourceUrl, 500);
    const requirements = this.sanitizeRequirements(this.normalizeStructuredForItem(item.requirements, {}));
    const materials = this.sanitizeMaterials(this.normalizeStructuredArrayForItem(item.materials));
    const process = this.sanitizeProcess(this.normalizeStructuredArrayForItem(item.process));
    const contact = this.sanitizeContact(this.normalizeStructuredForItem(item.contact, {}));
    const location = this.sanitizeLocation(this.normalizeText((item as any)?.location, 160));
    const rawContent = this.normalizeText(item.content, 12000) || null;

    const rawSubType = this.normalizeText((item as any)?.subType, 40).toLowerCase();
    const subType = rawSubType === 'framework' ? 'framework' : 'specific';

    return {
      title: normalizedTitle,
      announcementType: normalizedAnnouncementType,
      subType,
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
      location,
      requirements: this.serializeStructured(requirements),
      materials: this.serializeStructured(materials),
      process: this.serializeStructured(process),
      contact: this.serializeStructured(contact),
      rawContent,
      confidence: this.normalizeConfidence(item.confidence),
      status: 'published',
      // v0.3 按需点对点抓取归因：departmentId 直接写入，crawlJobId 用作日志/未匹配跟踪
      ...(item.departmentId ? { departmentId: this.normalizeText(item.departmentId, 80) } : {}),
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

  private cleanCampTitle(value?: string, maxLength: number = 300) {
    let title = this.normalizeText(value, maxLength * 3);
    if (!title) {
      return '';
    }

    title = title
      .replace(/^var\s+title\s*=\s*['"]?/i, '')
      .replace(/['"]\s*;?\s*\/\/.*$/u, '')
      .replace(/\s*\/\/\s*分享标题.*$/u, '')
      .trim();
    const noiseAlternation = TITLE_SUFFIX_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    title = title.replace(new RegExp(`(?:^|\\s)(?:${noiseAlternation})(?=\\s|$)`, 'gu'), ' ').trim();
    title = this.stripRepeatedLabels(title, TITLE_PREFIX_LABELS, true);
    title = this.stripRepeatedLabels(title, TITLE_SUFFIX_LABELS, false);
    title = title.replace(/\s*[-|｜_]\s*北京大学[^ ]+$/u, '').trim();
    title = title.replace(/发布日期[:：]?\s*\d{4}[./-年]\d{1,2}[./-月]\d{1,2}日?.*$/u, '').trim();
    title = title.replace(/^(.{2,40}?)\s+\1(?=关于)/u, '$1').trim();
    title = title.replace(/^(?:当前您的位置|您当前的位置|当前位置)[:：]?\s*/u, '').trim();
    const genericBreadcrumbPattern = /^(首页|正文|通知公告|硕士招生公示|信息公开|招生信息|招生公告)$/u;
    const weakBreadcrumbPattern = /^(首页|正文)$/u;
    const breadcrumbParts = title.split(/\s*>\s*/u).map((item) => item.trim()).filter(Boolean);
    if (breadcrumbParts.length > 1) {
      const meaningfulParts = breadcrumbParts.filter((item) => !genericBreadcrumbPattern.test(item));
      const fallbackParts = breadcrumbParts.filter((item) => !weakBreadcrumbPattern.test(item));
      title = meaningfulParts[meaningfulParts.length - 1] || fallbackParts[fallbackParts.length - 1] || breadcrumbParts[breadcrumbParts.length - 1] || title;
    }
    title = title.replace(
      /^.+?(?:信息公开|通知公告|招生信息|招生公告|研究生院|研究生招生信息网|研究生招生网站|研招网)\s+(?=.{0,80}(?:夏令营|暑期学校|推免|预推免|推荐免试|免试攻读))/u,
      '',
    ).trim();
    title = title.replace(
      /^(?:(?:信息公开|通知公告|招生信息|招生公告|研究生院|研究生招生信息网|研究生招生网站|研招网)\s+)+/u,
      '',
    ).trim();
    title = title.replace(weakBreadcrumbPattern, '').trim();
    title = title.replace(/\s*[-|｜_]\s*[^-|｜_]{0,60}(研究生招生网站|研招网|研究生院|招生信息网)$/u, '').trim();

    const coreMatch = title.match(
      /((?:[^。；;]{0,80})?关于举办[^。；;]*(?:夏令营|暑期学校|推免|预推免|推荐免试)[^。；;]*(?:通知|公告)?)/u,
    );
    if (coreMatch?.[1]) {
      title = coreMatch[1].trim();
    }

    title = title.replace(/((?:通知|公告))(?:\s+.*)?$/u, '$1').trim();
    title = title.replace(/发布日期[:：]?\s*\d{4}[./-年]\d{1,2}[./-月]\d{1,2}日?.*$/u, '').trim();
    title = title.replace(/\s+/g, ' ').trim();
    return this.normalizeText(title, maxLength);
  }

  private isSystemLikeTitle(value?: string) {
    const title = this.cleanCampTitle(value, 300).toLowerCase();
    if (!title) {
      return false;
    }
    const systemKeywords = [
      '报名系统',
      '管理服务系统',
      '信息管理系统',
      '申请系统',
      '申请平台',
      '报名平台',
      '登录系统',
      '登录平台',
      '管理平台',
      '服务平台',
      '网报系统',
    ];
    if (systemKeywords.some((keyword) => title.includes(keyword))) {
      return true;
    }
    if (/(?:夏令营|推免|预推免|推荐免试).{0,8}(?:系统|平台)$/u.test(title)) {
      return true;
    }
    return title.endsWith('系统') || title.endsWith('平台');
  }

  private sanitizeRequirements(value: Record<string, any>): Record<string, any> {
    const next: Record<string, any> = {};
    Object.keys(value || {}).forEach((key) => {
      const item = value[key];
      if (item === null || item === undefined) {
        return;
      }
      if (typeof item === 'string') {
        const text = this.normalizeText(item, 300);
        if (!text || this.containsCodeLikeContent(text)) {
          return;
        }
        next[key] = text;
        return;
      }
      next[key] = item;
    });
    return next;
  }

  private sanitizeMaterials(value: any[]): any[] {
    return this.sanitizeStructuredList(value, { dropGenericTemplates: false });
  }

  private sanitizeProcess(value: any[]): any[] {
    const process = this.sanitizeStructuredList(value, { dropGenericTemplates: true });
    return this.enforceStructuredProcessQuality(process);
  }

  private sanitizeStructuredList(value: any[], options: { dropGenericTemplates: boolean }): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const item of Array.isArray(value) ? value : []) {
      const normalized = this.sanitizeStructuredEntry(item, options.dropGenericTemplates);
      if (!normalized) {
        continue;
      }
      const key = typeof normalized === 'string'
        ? normalized
        : this.safeStringify(normalized);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }

  private sanitizeStructuredEntry(value: any, dropGenericTemplates: boolean): any {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      if (dropGenericTemplates) {
        return null;
      }
      const text = this.normalizeText(value, 200);
      if (!text || this.containsCodeLikeContent(text)) {
        return null;
      }
      if (text.length > 120) {
        return null;
      }
      if (dropGenericTemplates && this.looksLikeLowQualityProcessText(text)) {
        return null;
      }
      if (dropGenericTemplates && this.isGenericProcessTemplate(text)) {
        return null;
      }
      return text;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const next: Record<string, any> = {};
      Object.keys(value).forEach((key) => {
        const current = value[key];
        if (typeof current === 'string') {
          const text = this.normalizeText(current, 200);
          if (!text || this.containsCodeLikeContent(text)) {
            return;
          }
          next[key] = text;
          return;
        }
        if (current !== null && current !== undefined) {
          next[key] = current;
        }
      });
      if (!next.action && !next.title && !next.name && !next.step) {
        return null;
      }
      if (dropGenericTemplates && !this.isValidStructuredProcessStep(next)) {
        return null;
      }
      const combined = this.normalizeText(
        [next.action, next.title, next.name, next.note, next.description].filter(Boolean).join(' '),
        300,
      );
      if (!combined || this.containsCodeLikeContent(combined)) {
        return null;
      }
      return next;
    }
    return null;
  }

  private enforceStructuredProcessQuality(value: any[]): any[] {
    const process = Array.isArray(value) ? value : [];
    const objectSteps = process.filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
    if (objectSteps.length === 0) {
      return [];
    }
    return objectSteps.filter((item) => this.isValidStructuredProcessStep(item));
  }

  private isValidStructuredProcessStep(step: Record<string, any>): boolean {
    const action = this.normalizeText(step?.action || step?.title || step?.name || '', 120);
    const note = this.normalizeText(step?.note || step?.description || '', 200);
    const combined = this.normalizeText([action, note].filter(Boolean).join(' '), 260);
    if (!action) {
      return false;
    }
    if (action.length > 20) {
      return false;
    }
    if (/通知|公告|公示|名单|章程|简章/u.test(action) && !/报名|面试|复试|审核|确认|提交|公示/u.test(action)) {
      return false;
    }
    if (/^关于|^重庆大学2026年|^中国海洋大学2025年|^同济大学2026年|来啦/u.test(action)) {
      return false;
    }
    if (this.looksLikeLowQualityProcessText(action) || this.containsBlockedNoticeSignal(action)) {
      return false;
    }
    if (combined && /关于调整|拟录取名单公示|章程|简章|通知汇总/u.test(combined) && !/报名|复试|审核|确认|公示期间/u.test(combined)) {
      return false;
    }
    return true;
  }

  private sanitizeContact(value: Record<string, any>): Record<string, any> {
    const contact: Record<string, any> = {};
    const email = this.normalizeText(value?.email, 120);
    if (email && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u.test(email)) {
      contact.email = email;
    }

    const phone = this.normalizeText(value?.phone, 40);
    if (phone && /^(?:0\d{2,3}-\d{7,8}(?:-\d+)?|1[3-9]\d{9})$/u.test(phone)) {
      contact.phone = phone;
    }

    const address = this.normalizeText(value?.address, 160);
    if (address && this.isValidContactAddress(address)) {
      contact.address = address;
    }

    const other = Array.isArray(value?.other)
      ? value.other
          .map((item) => this.normalizeText(item, 120))
          .filter((item) => item && !this.containsCodeLikeContent(item))
      : [];
    if (other.length > 0) {
      contact.other = Array.from(new Set(other));
    }

    return contact;
  }

  private sanitizeLocation(value?: string | null): string | null {
    const location = this.normalizeText(value || '', 160);
    if (!location || this.containsCodeLikeContent(location)) {
      return null;
    }
    if (location.length < 4) {
      return null;
    }
    if (/(报名|截止|发布时间|联系方式|邮箱|电话|推荐信|申请表)/u.test(location)) {
      return null;
    }
    if (
      !/(区|县|镇|街道|路|号|楼|室|校区|学院|医院|会议室|中心|线上|线下|腾讯会议|zoom|燕园|学院路)/iu.test(
        location,
      )
    ) {
      return null;
    }
    return location;
  }

  private hasLowQualityRequirements(value: any): boolean {
    const requirements = this.normalizeStructuredForItem(value, {});
    const texts = Object.values(requirements || {})
      .map((item) => this.normalizeText(typeof item === 'string' ? item : this.safeStringify(item), 400))
      .filter(Boolean);
    if (texts.length === 0) {
      return false;
    }
    return texts.every((text) => text.length > 120 || /http|报名|流程|截止|网址/u.test(text));
  }

  private hasLowQualityMaterials(value: any): boolean {
    const materials = this.normalizeStructuredArrayForItem(value);
    if (materials.length === 0) {
      return false;
    }
    const noisyCount = materials.filter((item) => {
      const text = this.normalizeText(typeof item === 'string' ? item : this.safeStringify(item), 240);
      return !text || text.length > 60 || /报名|截止|流程|复试|考核|网址|http/u.test(text);
    }).length;
    return noisyCount > 0 && noisyCount >= Math.ceil(materials.length / 2);
  }

  private hasLowQualityProcess(value: any): boolean {
    const process = this.normalizeStructuredArrayForItem(value);
    if (process.length === 0) {
      return false;
    }
    if (this.hasFragmentedProcessEntries(process)) {
      return true;
    }
    const noisyCount = process.filter((item) => {
      const text = this.normalizeText(typeof item === 'string' ? item : this.safeStringify(item), 240);
      return this.looksLikeLowQualityProcessText(text);
    }).length;
    return noisyCount > 0 && noisyCount >= Math.ceil(process.length / 2);
  }

  private hasFragmentedProcessEntries(process: any[]): boolean {
    const entries = this.normalizeStructuredArrayForItem(process);
    if (entries.length === 0) {
      return false;
    }
    const textEntries = entries
      .filter((item) => typeof item === 'string')
      .map((item) => this.normalizeText(item as string, 240))
      .filter(Boolean);
    if (textEntries.length < 2) {
      return false;
    }
    const fragmentedCount = textEntries.filter((text) => {
      if (!text) {
        return true;
      }
      if (text.length <= 18) {
        return true;
      }
      if (/^[，,。.;；、:：）)\]】”"]/u.test(text) || /[（(“"'：:，,；;]$/u.test(text)) {
        return true;
      }
      if (/^(符合申请|申请者|考生|请申请者|复试通知|网上报名|正式录取通知书将于)$/u.test(text)) {
        return true;
      }
      if (/(登录|报名|提交|上传|确认|回复|通知书将于)$/u.test(text) && text.length <= 24) {
        return true;
      }
      return false;
    }).length;
    return fragmentedCount > 0 && fragmentedCount >= Math.ceil(textEntries.length / 3);
  }

  private looksLikeLowQualityProcessText(text: string): boolean {
    const value = this.normalizeText(text, 240);
    if (!value) {
      return true;
    }
    if (value.length > 48) {
      return true;
    }
    if (/^[”"’，,；;、）)\]]/u.test(value) || /[（(“"：:，,；;]$/u.test(value)) {
      return true;
    }
    if (/^(符合申请|申请者|考生|请申请者|复试通知|正式录取通知书将于)$/u.test(value)) {
      return true;
    }
    if (/https?:\/\/|网址[:：]|登录网址|网址http/u.test(value)) {
      return true;
    }
    if ((value.match(/[，,；;]/g) || []).length >= 2) {
      return true;
    }
    if (/招生简章|考核结果|现接受|补充报名|视情况审核|详见附件/u.test(value)) {
      return true;
    }
    return false;
  }

  private shouldReplaceProcessWithStructuredResult(current: any, incoming: any): boolean {
    const currentProcess = this.normalizeStructuredArrayForItem(current);
    const incomingProcess = this.normalizeStructuredArrayForItem(incoming);
    if (currentProcess.length === 0 || incomingProcess.length === 0) {
      return false;
    }
    const currentAllStrings = currentProcess.every((item) => typeof item === 'string');
    const incomingHasObjects = incomingProcess.some(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
    if (!currentAllStrings || !incomingHasObjects) {
      return false;
    }
    return this.hasLowQualityProcess(currentProcess) || this.hasFragmentedProcessEntries(currentProcess);
  }

  private mergeStructuredArrayItems(left: any, right: any): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const item of [
      ...this.normalizeStructuredArrayForItem(left),
      ...this.normalizeStructuredArrayForItem(right),
    ]) {
      const key = typeof item === 'string' ? item : this.safeStringify(item);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  private isValidContactAddress(address: string) {
    if (!address || address.length < 8) {
      return false;
    }
    if (['北京市', '上海市', '天津市', '重庆市'].includes(address)) {
      return false;
    }
    return /(区|县|镇|街道|路|号|楼|室|校区|学院|医院)/u.test(address);
  }

  private containsCodeLikeContent(text?: string) {
    const normalized = this.normalizeText(text, 400);
    if (!normalized) {
      return false;
    }
    return /(var\s+\w+\s*=|window\.location|document\.ready|navigator\.userAgent|function\s*\(|<script|\$\.\w+\()/iu.test(normalized);
  }

  private isGenericProcessTemplate(text: string) {
    // Drop only pure topic labels that carry no actionable info.
    // Keep "网上报名"/"提交材料"/"资格审核" — these ARE meaningful steps for users,
    // even when expressed as a bare phrase.
    return /^(夏令营活动|结果公布|拟录取结果公布)$/u.test(text);
  }

  private stripRepeatedLabels(value: string, labels: string[], fromStart: boolean) {
    let next = value.trim();
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = fromStart
        ? new RegExp(`^(?:${escaped}\\s*)+`, 'u')
        : new RegExp(`(?:\\s*${escaped})+$`, 'u');
      next = next.replace(pattern, '').trim();
    }
    return next;
  }

  private isLowValueTitle(title: string) {
    return LOW_VALUE_TITLES.has(this.normalizeText(title, 120));
  }

  private containsBlockedNoticeSignal(text?: string) {
    const normalized = this.normalizeText(text, 1200).toLowerCase();
    if (!normalized) {
      return false;
    }
    return BLOCKED_NOTICE_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
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
      if (this.shouldSkipChangeValue(oldValue) || this.shouldSkipChangeValue(newValue)) {
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
      if (!newValue || this.shouldSkipChangeValue(newValue)) {
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

  private shouldSkipChangeValue(value?: string) {
    const normalized = this.normalizeText(value, 500);
    if (!normalized) {
      return true;
    }
    return this.containsCodeLikeContent(normalized);
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
