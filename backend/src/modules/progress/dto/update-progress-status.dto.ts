import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROGRESS_STATUS_VALUES } from './create-progress.dto';

export class UpdateProgressStatusDto {
  @ApiProperty({ description: '目标状态', enum: PROGRESS_STATUS_VALUES })
  @IsIn(PROGRESS_STATUS_VALUES)
  status: (typeof PROGRESS_STATUS_VALUES)[number];

  @ApiPropertyOptional({ description: '状态备注', maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;

  @ApiPropertyOptional({ description: '下一步动作提示', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nextAction?: string;
}
