import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateSelectionDto } from './dto/update-selection.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

@ApiTags('用户')
@Controller('user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: '获取用户信息' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.userService.getProfile(userId);
  }

  @Get('selection')
  @ApiOperation({ summary: '获取用户选择' })
  async getSelection(@CurrentUser('sub') userId: string) {
    return this.userService.getSelection(userId);
  }

  @Put('selection')
  @ApiOperation({ summary: '更新用户选择' })
  async updateSelection(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSelectionDto,
  ) {
    return this.userService.updateSelection(userId, dto);
  }

  @Get('student-profile')
  @ApiOperation({ summary: '获取用户保研档案' })
  async getStudentProfile(@CurrentUser('sub') userId: string) {
    return this.userService.getStudentProfile(userId);
  }

  @Put('student-profile')
  @ApiOperation({ summary: '更新用户保研档案' })
  async updateStudentProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.userService.updateStudentProfile(userId, dto);
  }
}
