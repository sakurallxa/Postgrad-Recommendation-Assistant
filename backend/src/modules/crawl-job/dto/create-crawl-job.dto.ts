import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class CreateCrawlJobDto {
  @ApiProperty({ enum: ['initial_selection', 'refresh', 'incremental'], required: false })
  @IsOptional()
  @IsIn(['initial_selection', 'refresh', 'incremental'])
  triggerType?: 'initial_selection' | 'refresh' | 'incremental';

  @ApiProperty({
    description: '要抓取的院系 ID 列表 (departments.id, 如 "pku-cs")',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  departmentIds!: string[];
}
