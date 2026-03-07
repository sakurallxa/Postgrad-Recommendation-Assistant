import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 允许的排序字段白名单
 */
export const ALLOWED_SORT_FIELDS = ['name', 'priority', 'createdAt', 'updatedAt'] as const;
export type SortField = typeof ALLOWED_SORT_FIELDS[number];

/**
 * 查询院校列表DTO
 */
export class QueryUniversityDto {
  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ description: '每页数量', required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ description: '地区筛选', required: false })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ description: '等级筛选(985/211/双一流/普通)', required: false })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiProperty({ description: '关键词搜索', required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ description: '排序字段', required: false, default: 'priority', enum: ALLOWED_SORT_FIELDS })
  @IsOptional()
  @IsIn(ALLOWED_SORT_FIELDS)
  sortBy?: SortField = 'priority';

  @ApiProperty({ description: '排序方向', required: false, default: 'asc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
