import { Controller, Get, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { UniversityService } from './university.service';
import { QueryUniversityDto } from './dto/query-university.dto';

@ApiTags('院校')
@Controller('universities')
export class UniversityController {
  constructor(private readonly universityService: UniversityService) {}

  @Get()
  @ApiOperation({ summary: '获取院校列表', description: '支持分页、筛选、关键词搜索和排序' })
  async findAll(@Query() query: QueryUniversityDto) {
    return this.universityService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取院校详情', description: '获取院校详细信息，包含专业列表和夏令营信息' })
  @ApiParam({ name: 'id', description: '院校ID', type: 'string' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.universityService.findOne(id);
  }

  @Get(':id/majors')
  @ApiOperation({ summary: '获取院校专业列表', description: '获取指定院校的所有专业' })
  @ApiParam({ name: 'id', description: '院校ID', type: 'string' })
  async findMajors(@Param('id', ParseUUIDPipe) id: string) {
    return this.universityService.findMajors(id);
  }
}
