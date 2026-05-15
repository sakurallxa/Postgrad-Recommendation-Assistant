import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class BatchSubscribeDto {
  @IsArray()
  @IsString({ each: true })
  departmentIds!: string[];
}

@ApiTags('院系订阅')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('schools')
  @ApiOperation({ summary: '获取5校结构（学校→院系→专业）供选择' })
  async listSchools(@CurrentUser() user: any) {
    // 拉所有 active 院系 + 用户当前订阅状态
    const departments = await this.prisma.department.findMany({
      where: { active: true },
      include: { university: true },
      orderBy: [{ schoolSlug: 'asc' }, { name: 'asc' }],
    });

    const userSubs = user?.id
      ? await this.prisma.userDepartmentSubscription.findMany({
          where: { userId: user.id, active: true },
          select: { departmentId: true },
        })
      : [];
    const subscribedIds = new Set(userSubs.map((s) => s.departmentId));

    // 分组
    const grouped: Record<string, any> = {};
    for (const d of departments) {
      const slug = d.schoolSlug;
      if (!grouped[slug]) {
        grouped[slug] = {
          schoolSlug: slug,
          universityId: d.universityId,
          universityName: d.university?.name || slug,
          shortName: d.university?.name?.slice(0, 4) || slug,
          logo: d.university?.logo || null,
          departments: [],
        };
      }
      let majors: string[] = [];
      try {
        majors = JSON.parse(d.majors);
      } catch {}
      grouped[slug].departments.push({
        id: d.id,
        name: d.name,
        shortName: d.shortName,
        majors,
        homepage: d.homepage,
        subscribed: subscribedIds.has(d.id),
      });
    }

    return {
      schools: Object.values(grouped),
      totalSubscribed: subscribedIds.size,
    };
  }

  @Post('batch')
  @ApiOperation({ summary: '批量订阅院系（覆盖式：传入的成为最新订阅，其余取消）' })
  async batchSubscribe(@Body() body: BatchSubscribeDto, @CurrentUser() user: any) {
    if (!user?.id) throw new BadRequestException('需要登录');
    const validDepts = await this.prisma.department.findMany({
      where: { id: { in: body.departmentIds }, active: true },
      select: { id: true },
    });
    const validIds = new Set(validDepts.map((d) => d.id));
    if (validIds.size !== body.departmentIds.length) {
      throw new BadRequestException('包含无效的 departmentId');
    }

    // 当前订阅
    const current = await this.prisma.userDepartmentSubscription.findMany({
      where: { userId: user.id },
    });
    const currentIds = new Set(current.map((c) => c.departmentId));

    // 需新增
    const toAdd = body.departmentIds.filter((id) => !currentIds.has(id));
    // 需停用
    const toDeactivate = current
      .filter((c) => !validIds.has(c.departmentId))
      .map((c) => c.id);
    // 需激活
    const toActivate = current
      .filter((c) => validIds.has(c.departmentId) && !c.active)
      .map((c) => c.id);

    if (toAdd.length) {
      await this.prisma.userDepartmentSubscription.createMany({
        data: toAdd.map((deptId) => ({
          userId: user.id,
          departmentId: deptId,
          active: true,
        })),
      });
    }
    if (toDeactivate.length) {
      await this.prisma.userDepartmentSubscription.updateMany({
        where: { id: { in: toDeactivate } },
        data: { active: false },
      });
    }
    if (toActivate.length) {
      await this.prisma.userDepartmentSubscription.updateMany({
        where: { id: { in: toActivate } },
        data: { active: true },
      });
    }

    return {
      added: toAdd.length,
      removed: toDeactivate.length,
      reactivated: toActivate.length,
      totalActive: body.departmentIds.length,
    };
  }

  @Delete(':departmentId')
  @ApiOperation({ summary: '取消单个院系订阅' })
  async unsubscribe(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: any,
  ) {
    await this.prisma.userDepartmentSubscription.updateMany({
      where: { userId: user.id, departmentId },
      data: { active: false },
    });
    return { ok: true };
  }

  @Get('recommendations')
  @ApiOperation({
    summary: '基于用户档案 targetMajors 推荐应订阅的院系',
    description: '用于"首次使用引导"或"完善订阅"提示',
  })
  async recommend(@CurrentUser() user: any) {
    if (!user?.id) throw new BadRequestException('需要登录');
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile?.targetMajors) {
      return { recommendations: [], reason: 'targetMajors 未设置' };
    }
    let targetMajors: string[] = [];
    try {
      targetMajors = JSON.parse(profile.targetMajors);
    } catch {}
    if (!targetMajors.length) {
      return { recommendations: [], reason: 'targetMajors 为空' };
    }

    const allDepts = await this.prisma.department.findMany({
      where: { active: true },
      include: { university: true },
    });

    const recommendations = allDepts
      .map((d) => {
        let majors: string[] = [];
        try {
          majors = JSON.parse(d.majors);
        } catch {}
        const hits = majors.filter((m) =>
          targetMajors.some(
            (tm) =>
              m.includes(tm) ||
              tm.includes(m) ||
              this.normalizeMajor(m) === this.normalizeMajor(tm),
          ),
        );
        return { dept: d, hits };
      })
      .filter((r) => r.hits.length > 0)
      .sort((a, b) => b.hits.length - a.hits.length)
      .map((r) => ({
        departmentId: r.dept.id,
        departmentName: r.dept.name,
        schoolSlug: r.dept.schoolSlug,
        universityName: r.dept.university?.name,
        matchingMajors: r.hits,
      }));

    return { recommendations };
  }

  private normalizeMajor(s: string): string {
    return s.replace(/[\s、，,]+/g, '').toLowerCase();
  }
}
