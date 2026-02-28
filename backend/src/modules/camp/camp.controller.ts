import { Controller, Get, Query, Param, ParseUUIDPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
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
    @Query('universityIds') universityIds?: string,
    @Query('majorId') majorId?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
  ) {
    const parsedUniversityIds = universityIds
      ? universityIds.split(',').map(id => id.trim()).filter(Boolean)
      : undefined;
    const parsedYear = year ? Number(year) : undefined;
    return this.campService.findAll({
      page,
      limit,
      universityId,
      universityIds: parsedUniversityIds,
      majorId,
      status,
      year: Number.isFinite(parsedYear) ? parsedYear : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '获取夏令营详情', description: '获取夏令营详细信息，包含关联院校和专业' })
  @ApiParam({ name: 'id', description: '夏令营ID', type: 'string' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    // Service层已处理NotFoundException，直接返回结果
    return this.campService.findOne(id);
  }
}
