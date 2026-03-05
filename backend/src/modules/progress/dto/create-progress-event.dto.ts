import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const PROGRESS_EVENT_TYPE_VALUES = [
  'deadline',
  'materials',
  'admission_result',
  'outstanding_result',
] as const;

export class CreateProgressEventDto {
  @ApiProperty({ description: '夏令营ID' })
  @IsUUID()
  campId: string;

  @ApiProperty({ description: '变更类型', enum: PROGRESS_EVENT_TYPE_VALUES })
  @IsIn(PROGRESS_EVENT_TYPE_VALUES)
  eventType: (typeof PROGRESS_EVENT_TYPE_VALUES)[number];

  @ApiPropertyOptional({ description: '变更字段', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fieldName?: string;

  @ApiPropertyOptional({ description: '变更前值', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  oldValue?: string;

  @ApiPropertyOptional({ description: '变更后值', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  newValue?: string;

  @ApiPropertyOptional({ description: '来源原文片段（用于名单解析）', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  sourceSnippet?: string;

  @ApiPropertyOptional({ description: '事件幂等键', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: '来源类型', default: 'crawler' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sourceType?: string;

  @ApiPropertyOptional({ description: '来源地址' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  sourceUrl?: string;

  @ApiPropertyOptional({ description: '来源更新时间' })
  @IsOptional()
  @IsDateString()
  sourceUpdatedAt?: string;

  @ApiPropertyOptional({ description: '可信度标签（可不传，服务端自动计算）' })
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  confidenceLabel?: 'high' | 'medium' | 'low';

  @ApiPropertyOptional({ description: '可信度分值 0-1（可不传，服务端自动计算）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  confidenceScore?: number;
}
