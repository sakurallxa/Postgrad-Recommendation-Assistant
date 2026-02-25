import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WxLoginDto {
  @ApiProperty({ description: '微信临时登录凭证', example: 'mock_code_123' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
