import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateStudentProfileDto {
  @ApiProperty({ description: '当前学校', required: false })
  @IsOptional()
  @IsString()
  schoolName?: string;

  @ApiProperty({ description: '学校层次', required: false })
  @IsOptional()
  @IsString()
  schoolLevel?: string;

  @ApiProperty({ description: '学历层次', required: false })
  @IsOptional()
  @IsIn(['本科在读', '本科毕业', '硕士在读', '其他'])
  education?: string;

  @ApiProperty({ description: '当前专业', required: false })
  @IsOptional()
  @IsString()
  major?: string;

  @ApiProperty({ description: '成绩排名前百分比', required: false, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rankPercent?: number;

  @ApiProperty({ description: '成绩补充描述', required: false })
  @IsOptional()
  @IsString()
  rankText?: string;

  @ApiProperty({ description: 'GPA描述', required: false })
  @IsOptional()
  @IsString()
  gpa?: string;

  @ApiProperty({ description: '英语成绩类型', required: false })
  @IsOptional()
  @IsIn(['none', 'cet4', 'cet6', 'ielts', 'toefl', 'other'])
  englishType?: string;

  @ApiProperty({ description: '英语分数', required: false, minimum: 0, maximum: 999 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999)
  englishScore?: number;

  @ApiProperty({ description: '专业学科排名（教育部学科评估）', required: false })
  @IsOptional()
  @IsIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', '未上榜', '不确定'])
  subjectRanking?: string;

  @ApiProperty({ description: '科研经历', required: false })
  @IsOptional()
  @IsIn(['none', 'basic', 'rich', 'unknown'])
  researchExperience?: string;

  @ApiProperty({ description: '竞赛获奖', required: false })
  @IsOptional()
  @IsIn(['none', 'school', 'province', 'national', 'unknown'])
  competitionAwards?: string;

  @ApiProperty({ description: '意向方向', required: false })
  @IsOptional()
  @IsString()
  preferredDirection?: string;

  @ApiProperty({ description: '个人补充说明', required: false })
  @IsOptional()
  @IsString()
  targetNote?: string;
}
