import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

const VALID_ISSUE_TYPES = [
  'deadline_wrong',
  'materials_missing',
  'requirements_wrong',
  'link_dead',
  'content_wrong',
  'off_topic',
  'other',
] as const;

class SubmitFeedbackDto {
  @IsString()
  @IsIn([...VALID_ISSUE_TYPES])
  issueType!: (typeof VALID_ISSUE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

@ApiTags('公告反馈')
@Controller('camps/:campId/feedback')
export class CampFeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: '用户报告公告字段错误（β场景反馈闭环入口）' })
  async submit(
    @Param('campId', ParseUUIDPipe) campId: string,
    @Body() body: SubmitFeedbackDto,
  ) {
    const camp = await this.prisma.campInfo.findUnique({
      where: { id: campId },
      select: { id: true },
    });
    if (!camp) {
      throw new BadRequestException(`公告不存在: ${campId}`);
    }
    const feedback = await this.prisma.campFeedback.create({
      data: {
        campId,
        userId: body.userId || null,
        issueType: body.issueType,
        description: body.description || null,
      },
    });
    return {
      id: feedback.id,
      message: '反馈已收到，48小时内人工核对',
      createdAt: feedback.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: '查看某条公告的全部反馈（运营/复核台使用）' })
  async list(
    @Param('campId', ParseUUIDPipe) campId: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.campFeedback.findMany({
      where: {
        campId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
