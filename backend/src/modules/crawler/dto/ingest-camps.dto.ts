import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CrawlerCampItemDto {
  @ApiProperty({ description: '公告标题' })
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({
    description: '公告类型',
    enum: ['summer_camp', 'pre_recommendation'],
    default: 'summer_camp',
  })
  @IsOptional()
  @IsString()
  announcementType?: string;

  @ApiPropertyOptional({
    description: '公告子类型：framework=章程/工作办法（无统一截止日），specific=有具体报名时间的招生公告',
    enum: ['framework', 'specific'],
  })
  @IsOptional()
  @IsString()
  subType?: string;

  @ApiProperty({ description: '院校ID（universities.id）' })
  @IsString()
  universityId: string;

  @ApiProperty({ description: '原文链接' })
  @IsUrl({ require_tld: false })
  sourceUrl: string;

  @ApiPropertyOptional({ description: '发布日期（ISO）' })
  @IsOptional()
  @IsString()
  publishDate?: string;

  @ApiPropertyOptional({ description: '截止时间（ISO）' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO）' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO）' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '举办地点' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: '申请要求（对象/JSON字符串）' })
  @IsOptional()
  requirements?: any;

  @ApiPropertyOptional({ description: '所需材料（数组/JSON字符串）' })
  @IsOptional()
  materials?: any;

  @ApiPropertyOptional({ description: '报名流程（数组/JSON字符串）' })
  @IsOptional()
  process?: any;

  @ApiPropertyOptional({ description: '联系方式（对象/JSON字符串）' })
  @IsOptional()
  contact?: any;

  @ApiPropertyOptional({ description: '正文内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '置信度 0-1' })
  @IsOptional()
  confidence?: number;

  @ApiPropertyOptional({ description: '爬取时间（ISO）' })
  @IsOptional()
  @IsString()
  crawlTime?: string;

  @ApiPropertyOptional({ description: '爬虫名称' })
  @IsOptional()
  @IsString()
  spiderName?: string;
}

export class IngestCrawlerCampsDto {
  @ApiProperty({ type: [CrawlerCampItemDto], description: '待入库 camp 列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrawlerCampItemDto)
  items: CrawlerCampItemDto[];

  @ApiPropertyOptional({
    description: '新建 camp 时是否产出基线事件（old=null,new=当前值）',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  emitBaselineEvents?: boolean;
}
