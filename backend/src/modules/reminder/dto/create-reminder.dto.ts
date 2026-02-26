import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 创建提醒DTO
 * 注意：userId从JWT令牌中获取，禁止客户端传入
 */
export class CreateReminderDto {
  @ApiProperty({ description: '夏令营ID', example: 'camp_123' })
  @IsString()
  @IsNotEmpty()
  campId: string;

  @ApiPropertyOptional({ description: '提醒时间', example: '2024-06-01T09:00:00Z' })
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional({ description: '提醒内容', example: '夏令营报名截止提醒' })
  @IsOptional()
  @IsString()
  content?: string;
}
