import { Controller, Get, Query, Headers, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * 内部接口：供 crawler/spider 使用，按 ID 批量查询院系详情。
 * 用 X-Internal-Token 简单鉴权（同进程或同机部署时足够）。
 */
@ApiTags('内部 · 院系')
@Controller('internal/departments')
export class InternalDepartmentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Get('by-ids')
  @ApiOperation({ summary: '按 ID 列表批量查询院系（含学校名/homepage/noticeUrl）' })
  async byIds(
    @Query('ids') idsParam: string,
    @Headers('x-internal-token') token: string,
  ) {
    const expected = this.configService.get<string>('INTERNAL_API_TOKEN') || '';
    if (expected && token !== expected) {
      throw new ForbiddenException('内部接口需要正确的 X-Internal-Token');
    }
    if (!idsParam) throw new BadRequestException('ids 参数为空');
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return { departments: [] };

    const depts = await this.prisma.department.findMany({
      where: { id: { in: ids }, active: true },
      include: { university: { select: { id: true, name: true } } },
    });
    return {
      departments: depts.map((d) => ({
        id: d.id,
        name: d.name,
        shortName: d.shortName,
        schoolSlug: d.schoolSlug,
        universityId: d.universityId,
        universityName: d.university?.name,
        homepage: d.homepage,
        noticeUrl: d.noticeUrl,
        majors: (() => {
          try {
            return JSON.parse(d.majors || '[]');
          } catch {
            return [];
          }
        })(),
      })),
    };
  }
}
