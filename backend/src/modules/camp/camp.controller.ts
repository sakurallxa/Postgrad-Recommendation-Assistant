import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CampService } from './camp.service';

@ApiTags('夏令营')
@Controller('camps')
export class CampController {
  constructor(private readonly campService: CampService) {}

  @Get()
  @ApiOperation({ summary: '获取夏令营列表' })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('universityId') universityId?: string,
    @Query('majorId') majorId?: string,
  ) {
    return this.campService.findAll({ page, limit, universityId, majorId });
  }
}
