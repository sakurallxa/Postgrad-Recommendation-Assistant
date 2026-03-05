import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PROGRESS_CONFIRMABLE_STATUS_VALUES = [
  'submitted',
  'admitted',
  'outstanding_published',
] as const;

export class ConfirmProgressStepDto {
  @ApiProperty({
    description: '确认推进到的状态',
    enum: PROGRESS_CONFIRMABLE_STATUS_VALUES,
  })
  @IsIn(PROGRESS_CONFIRMABLE_STATUS_VALUES)
  status: (typeof PROGRESS_CONFIRMABLE_STATUS_VALUES)[number];

  @ApiPropertyOptional({ description: '确认备注', maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
