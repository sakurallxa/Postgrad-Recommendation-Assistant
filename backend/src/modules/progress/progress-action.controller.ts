import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { ConsumeProgressActionDto } from './dto/consume-progress-action.dto';

@ApiTags('申请进展动作')
@Controller('progress/actions')
export class ProgressActionController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('consume')
  @ApiOperation({ summary: '消费一次性进展动作 token（用于微信一键确认）' })
  async consume(@Body() dto: ConsumeProgressActionDto) {
    return this.progressService.consumeActionToken(dto.token);
  }
}
