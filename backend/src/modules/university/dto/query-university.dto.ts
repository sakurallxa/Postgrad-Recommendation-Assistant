import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 查询院校列表DTO
 */
export class QueryUniversityDto {
  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ description: '每页数量', required: false, default: 20 })
  @IsOptional()
  @IsNumber()
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

  @ApiProperty({ description: '排序字段', required: false, default: 'priority' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'priority';

  @ApiProperty({ description: '排序方向', required: false, default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}
