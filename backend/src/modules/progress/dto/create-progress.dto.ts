import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const PROGRESS_STATUS_VALUES = [
  'followed',
  'preparing',
  'submitted',
  'waiting_admission',
  'admitted',
  'waiting_outstanding',
  'outstanding_published',
] as const;

export class CreateProgressDto {
  @ApiProperty({ description: '夏令营ID' })
  @IsUUID()
  campId: string;

  @ApiPropertyOptional({
    description: '初始状态',
    enum: PROGRESS_STATUS_VALUES,
    default: 'followed',
  })
  @IsOptional()
  @IsIn(PROGRESS_STATUS_VALUES)
  status?: (typeof PROGRESS_STATUS_VALUES)[number];

  @ApiPropertyOptional({ description: '下一步动作提示', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nextAction?: string;

  @ApiPropertyOptional({ description: '备注', maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
