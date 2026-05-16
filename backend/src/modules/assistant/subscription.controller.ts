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
  @ApiOperation({ summary: '获取所有保研院校（按教育部官方名单：985/211/双一流）及其院系，用户可自由订阅' })
  async listSchools(@CurrentUser() user: any) {
    // 推免高校筛选：按官方工程标记取并集（985 ⊂ 211 ⊂ 双一流，所以只查 is211 OR isDoubleFirstClass 即可覆盖全部）
    // 同时保留旧 level 兼容（中科院系统等不在三大工程里但应该展示的）
    const universities = await this.prisma.university.findMany({
      where: {
        OR: [
          { is985: true },
          { is211: true },
          { isDoubleFirstClass: true },
          { level: { in: ['985', '211', '双一流', '中科院'] } }, // legacy 字段兜底
        ],
      },
      include: {
        departments: { where: { active: true }, orderBy: { name: 'asc' } },
      },
    });

    const userSubs = user?.sub
      ? await this.prisma.userDepartmentSubscription.findMany({
          where: { userId: user.sub, active: true },
          select: { departmentId: true },
        })
      : [];
    const subscribedIds = new Set(userSubs.map((s) => s.departmentId));

    // 排序：用户已订阅的学校 > 详细院系（>1个）> 默认院系（仅1个）
    const schools = universities
      .map((u) => {
        const deptList = u.departments.map((d) => {
          let majors: string[] = [];
          try {
            majors = JSON.parse(d.majors);
          } catch {}
          return {
            id: d.id,
            name: d.name,
            shortName: d.shortName,
            majors,
            homepage: d.homepage,
            subscribed: subscribedIds.has(d.id),
          };
        });
        const subscribedCount = deptList.filter((d) => d.subscribed).length;
        const hasDetailedDepts = deptList.length > 1;
        return {
          schoolSlug: u.id, // 用 universityId 作为唯一标识
          universityId: u.id,
          universityName: u.name,
          shortName: u.name.slice(0, 4),
          logo: u.logo || null,
          level: u.level || null, // legacy 单值字段，保留兼容
          // 国家三大工程标记（包含关系，前端按这 3 个 boolean 做过滤）
          is985: u.is985,
          is211: u.is211,
          isDoubleFirstClass: u.isDoubleFirstClass,
          hasDetailedDepts,
          subscribedCount,
          departments: deptList,
        };
      })
      .sort((a, b) => {
        // 已订阅在前
        if (a.subscribedCount !== b.subscribedCount) {
          return b.subscribedCount - a.subscribedCount;
        }
        // 有详细院系的在前
        if (a.hasDetailedDepts !== b.hasDetailedDepts) {
          return a.hasDetailedDepts ? -1 : 1;
        }
        return a.universityName.localeCompare(b.universityName);
      });

    return {
      schools,
      totalSubscribed: subscribedIds.size,
    };
  }

  @Post('batch')
  @ApiOperation({ summary: '批量订阅院系（覆盖式：传入的成为最新订阅，其余取消）' })
  async batchSubscribe(@Body() body: BatchSubscribeDto, @CurrentUser() user: any) {
    if (!user?.sub) throw new BadRequestException('需要登录');
    // 后端硬限制：最多 5 个 dept，防止恶意/异常客户端绕过前端限制
    const MAX_SUBSCRIPTIONS = 5;
    if (body.departmentIds.length > MAX_SUBSCRIPTIONS) {
      throw new BadRequestException(`最多订阅 ${MAX_SUBSCRIPTIONS} 个院系`);
    }
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
      where: { userId: user.sub },
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
          userId: user.sub,
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
      where: { userId: user.sub, departmentId },
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
    if (!user?.sub) throw new BadRequestException('需要登录');
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.sub },
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
