import { IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 更新用户选择DTO
 */
export class UpdateSelectionDto {
  @ApiProperty({ description: '关注的院校ID列表', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  universityIds?: string[];

  @ApiProperty({ description: '关注的专业ID列表', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  majorIds?: string[];
}
