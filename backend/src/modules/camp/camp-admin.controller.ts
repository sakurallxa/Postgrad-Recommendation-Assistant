import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlerService } from '../crawler/crawler.service';

class AdminEditCampDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsISO8601()
  deadline?: string | null;

  @IsOptional()
  @IsISO8601()
  startDate?: string | null;

  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsString()
  @IsIn(['published', 'expired', 'draft', 'hidden'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['specific', 'framework'])
  subType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}

class AdminRecrawlDto {
  @IsOptional()
  @IsString()
  universityId?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

/**
 * 复核台运营接口（β场景）
 * - 编辑公告关键字段（修正抓取错误）
 * - 触发特定学校立即重抓
 *
 * 鉴权：通过 X-Admin-Key Header，密钥来自环境变量 CRAWLER_ADMIN_KEY
 */
@ApiTags('运营管理')
@Controller('admin/camps')
export class CampAdminController {
  private readonly logger = new Logger(CampAdminController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly crawlerService: CrawlerService,
  ) {}

  private assertAdminKey(key?: string) {
    const expected = this.configService.get<string>('CRAWLER_ADMIN_KEY') || '';
    if (!expected) {
      throw new UnauthorizedException('未配置 CRAWLER_ADMIN_KEY，禁止管理操作');
    }
    if (!key || key !== expected) {
      throw new UnauthorizedException('管理员密钥不正确');
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: '运营手动编辑公告字段（修正抓取错误）' })
  async edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminEditCampDto,
    @Headers('x-admin-key') adminKey?: string,
  ) {
    this.assertAdminKey(adminKey);
    const camp = await this.prisma.campInfo.findUnique({ where: { id } });
    if (!camp) {
      throw new BadRequestException(`公告不存在: ${id}`);
    }
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.subType !== undefined) updateData.subType = body.subType;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('无可更新字段');
    }
    const updated = await this.prisma.campInfo.update({ where: { id }, data: updateData });
    this.logger.log(`[admin-edit] ${id} fields=${Object.keys(updateData).join(',')} note=${body.adminNote || ''}`);
    return { id: updated.id, updatedFields: Object.keys(updateData), updatedAt: updated.updatedAt };
  }

  @Post('recrawl')
  @ApiOperation({ summary: '立即触发某校（或全部）重抓' })
  async recrawl(
    @Body() body: AdminRecrawlDto,
    @Headers('x-admin-key') adminKey?: string,
  ) {
    this.assertAdminKey(adminKey);
    return this.crawlerService.trigger(body.universityId, body.priority, 1);
  }
}
