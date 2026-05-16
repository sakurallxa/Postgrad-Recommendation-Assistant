import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { CrawlerService } from './crawler.service';
import { BaoyantongzhiMirrorService } from './baoyantongzhi-mirror.service';
import { MirrorSnapshotService } from './mirror-snapshot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IngestCrawlerCampsDto } from './dto/ingest-camps.dto';
import { Optional } from '@nestjs/common';

@ApiTags('爬虫')
@Controller('crawler')
export class CrawlerController {
  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly mirrorService: BaoyantongzhiMirrorService,
    @Optional() private readonly snapshotService?: MirrorSnapshotService,
  ) {}

  @Get('mirror/health')
  @ApiOperation({ summary: '镜像数据源健康度' })
  async mirrorHealth() {
    if (this.snapshotService) return this.snapshotService.getHealth();
    return { mirror: this.mirrorService.getHealth(), snapshots: { total: 0, latest: null } };
  }

  @Post('admin/rematch-all-users')
  @ApiOperation({
    summary: '(运维) 一次性：失效全部用户的 CampMatchResult 并重跑 LLM 匹配',
    description: '修复"用户改过 profile 但 AI 仍说没填"的积压。X-Crawler-Ingest-Key 鉴权。',
  })
  async rematchAllUsers(@Headers('x-crawler-ingest-key') ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    return this.crawlerService.rematchAllUsers();
  }

  @Post('mirror/snapshot/run')
  @ApiOperation({ summary: '管理员手动触发一次 snapshot' })
  async runSnapshot(@Headers('x-crawler-ingest-key') ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    if (!this.snapshotService) return { skipped: true, reason: 'snapshot service not loaded' };
    return this.snapshotService.snapshot();
  }

  @Post('mirror/baoyantongzhi/sync')
  @ApiOperation({
    summary: '从 baoyantongzhi.com 全量补抓',
    description: '管理员触发，从镜像站点拉取指定年份的全部 985 公告。受 X-Crawler-Ingest-Key 保护。',
  })
  async syncFromBaoyantongzhi(
    @Headers('x-crawler-ingest-key') ingestKey: string,
    @Query('year') year?: string,
    @Query('level') level?: string,
  ) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const lvl = level || '985';
    return this.mirrorService.syncFull(y, lvl);
  }

  @Post('mirror/baoyantongzhi/backfill-depts')
  @ApiOperation({
    summary: '从 baoyantongzhi 全量建立 Department 表（针对 211 / 双一流 / 中科院系统）',
    description: '修复"非 985 学校在小程序里无可选院系"问题',
  })
  async backfillDeptsFromMirror(@Headers('x-crawler-ingest-key') ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    return this.mirrorService.backfillDeptsFromMirror();
  }

  @Post('mirror/baoyantongzhi/backfill-logos-by-school')
  @ApiOperation({
    summary: '精确按学校名补 logo（针对批量分页漏抓的小众学校）',
  })
  async backfillLogosBySchool(@Headers('x-crawler-ingest-key') ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    return this.mirrorService.backfillLogosBySchool();
  }

  @Post('mirror/baoyantongzhi/backfill-logos')
  @ApiOperation({
    summary: '只回填 University.logo（轻量，不触发 ingest/LLM）',
    description: '拉历史多年记录抽 logoEnglishName，把 University.logo 更新为镜像源校徽 URL。',
  })
  async backfillLogos(@Headers('x-crawler-ingest-key') ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    return this.mirrorService.backfillLogosOnly();
  }

  @Post('mirror/baoyantongzhi/backfill-departments')
  @ApiOperation({
    summary: '回填镜像 CampInfo 的 departmentId 并触发 LLM 匹配',
    description: '扫描所有缺 departmentId 的镜像 camp，从 title 反解所属学院，匹配后调度 LLM 匹配。',
  })
  async backfillBaoyantongzhi(@Headers('x-crawler-ingest-key') ingestKey: string) {
    const expected = process.env.CRAWLER_INGEST_KEY || '';
    if (expected && ingestKey !== expected) {
      throw new UnauthorizedException('需要正确的 X-Crawler-Ingest-Key');
    }
    return this.mirrorService.backfillDepartmentIdsAndMatch();
  }

  @Post('trigger')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '手动触发爬虫', description: '触发爬虫任务，支持全量爬取或指定院校' })
  @ApiQuery({ name: 'universityId', required: false, description: '指定院校ID' })
  @ApiQuery({ name: 'priority', required: false, description: '优先级筛选 (P0/P1/P2/P3)' })
  @ApiQuery({ name: 'yearSpan', required: false, description: '抓取近N年数据，默认3年' })
  async trigger(
    @Query('universityId') universityId?: string,
    @Query('priority') priority?: string,
    @Query('yearSpan') yearSpan?: string,
  ) {
    const parsedYearSpan = yearSpan ? Number(yearSpan) : 3;
    return this.crawlerService.trigger(
      universityId,
      priority,
      Number.isFinite(parsedYearSpan) && parsedYearSpan > 0 ? parsedYearSpan : 3,
    );
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取爬虫日志' })
  async getLogs() {
    return this.crawlerService.getLogs();
  }

  @Get('tasks/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取任务状态', description: '查询指定爬虫任务的执行状态' })
  async getTaskStatus(@Param('taskId') taskId: string) {
    return this.crawlerService.getTaskStatus(taskId);
  }

  @Post('ingest-camps')
  @ApiHeader({
    name: 'X-Crawler-Ingest-Key',
    required: true,
    description: '爬虫入库共享密钥（需与后端 CRAWLER_INGEST_KEY 一致）',
  })
  @ApiOperation({
    summary: '爬虫结果入库',
    description: '批量 upsert camp，并在字段变更时自动创建 ProgressChangeEvent（含 old/new/source）',
  })
  async ingestCamps(
    @Headers('x-crawler-ingest-key') ingestKey: string,
    @Body() dto: IngestCrawlerCampsDto,
  ) {
    const configuredKey = (process.env.CRAWLER_INGEST_KEY || '').trim();
    if (!configuredKey) {
      throw new UnauthorizedException(
        '服务端未配置 CRAWLER_INGEST_KEY，已拒绝 ingest 请求',
      );
    }
    if ((ingestKey || '').trim() !== configuredKey) {
      throw new UnauthorizedException('X-Crawler-Ingest-Key 无效');
    }

    return this.crawlerService.ingestCamps(dto.items, {
      emitBaselineEvents: dto.emitBaselineEvents !== false,
      sourceType: 'crawler',
    });
  }
}
