import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateProgressSubscriptionDto {
  @ApiPropertyOptional({ description: '是否开启订阅' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '截止时间变更订阅' })
  @IsOptional()
  @IsBoolean()
  deadlineChanged?: boolean;

  @ApiPropertyOptional({ description: '材料要求变更订阅' })
  @IsOptional()
  @IsBoolean()
  materialsChanged?: boolean;

  @ApiPropertyOptional({ description: '入营名单变更订阅' })
  @IsOptional()
  @IsBoolean()
  admissionResultChanged?: boolean;

  @ApiPropertyOptional({ description: '优秀营员结果变更订阅' })
  @IsOptional()
  @IsBoolean()
  outstandingResultChanged?: boolean;
}
