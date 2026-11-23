import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { Project } from '@prodflow/contracts';
import { AuthModule, AuthRequest, Roles, SessionGuard } from '../auth/auth.module';
import { DatabaseService } from '../database/database.module';
export class ListQuery {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset =
    0;
}
export class CreateProjectDto {
  @ApiProperty({ example: 'PF-2026-003' })
  @IsString()
  @Length(1, 30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  projectNumber!: string;
  @ApiProperty({ example: 'Partia elementów montażowych' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 150)
  name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority = 'normal';
}
@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}
  async list(limit = 50, offset = 0): Promise<Project[]> {
    return (
      await this.db.query<Project>(
        `SELECT p.id::text,p.project_number,p.name,p.description,p.status,p.priority,
      p.due_date::text,c.name AS customer_name,
      COALESCE(t.task_count,0)::int AS task_count,COALESCE(t.completed_count,0)::int AS completed_count,
      COALESCE(t.planned_minutes,0)::int AS planned_minutes,
      COALESCE(w.actual_minutes,0)::int AS actual_minutes
      FROM projects p LEFT JOIN customers c ON c.id=p.customer_id
      LEFT JOIN LATERAL (SELECT count(*) AS task_count,count(*) FILTER (WHERE status='completed') AS completed_count,
        sum(planned_minutes) AS planned_minutes FROM tasks WHERE project_id=p.id AND status<>'cancelled') t ON true
      LEFT JOIN LATERAL (SELECT floor(sum(EXTRACT(epoch FROM (COALESCE(ws.ended_at,CURRENT_TIMESTAMP)-ws.started_at)))/60) AS actual_minutes
        FROM work_sessions ws JOIN tasks wt ON wt.id=ws.task_id WHERE wt.project_id=p.id) w ON true
      ORDER BY p.created_at DESC,p.id DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      )
    ).rows;
  }
  async create(dto: CreateProjectDto, userId: string) {
    try {
      return await this.db.transaction(async (tx) => {
        const result = (
          await tx.query(
            `INSERT INTO projects(project_number,name,description,priority,created_by_id)
          VALUES ($1,$2,$3,$4,$5) RETURNING id::text,project_number,name,status,priority`,
            [dto.projectNumber, dto.name, dto.description || null, dto.priority, userId],
          )
        ).rows[0];
        await tx.query(
          "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,new_data) VALUES ($1,'project.create','project',$2,$3::jsonb)",
          [userId, result.id, JSON.stringify(result)],
        );
        return result;
      });
    } catch (error: any) {
      if (error.code === '23505')
        throw new ConflictException('Zlecenie o tym numerze już istnieje.');
      throw error;
    }
  }
}
@ApiTags('Zlecenia')
@ApiCookieAuth()
@Controller('projects')
@UseGuards(SessionGuard)
@Roles('manager', 'admin')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}
  @Get() list(@Query() query: ListQuery) {
    return this.service.list(query.limit, query.offset);
  }
  @Post() create(@Body() dto: CreateProjectDto, @Req() req: AuthRequest) {
    return this.service.create(dto, req.user.id);
  }
}
@Module({
  imports: [AuthModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
