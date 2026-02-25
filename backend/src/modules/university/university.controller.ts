import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UniversityService } from './university.service';

@ApiTags('院校')
@Controller('universities')
export class UniversityController {
  constructor(private readonly universityService: UniversityService) {}

  @Get()
  @ApiOperation({ summary: '获取院校列表' })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('region') region?: string,
    @Query('level') level?: string,
  ) {
    return this.universityService.findAll({ page, limit, region, level });
  }
}
