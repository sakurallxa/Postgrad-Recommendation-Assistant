import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ConsumeProgressActionDto {
  @ApiProperty({ description: '一次性动作 token' })
  @IsString()
  @MaxLength(128)
  token: string;
}
