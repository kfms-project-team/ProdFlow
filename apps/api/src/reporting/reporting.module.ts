import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthModule, Roles, SessionGuard } from '../auth/auth.module';
import { DatabaseService } from '../database/database.module';
import { ProjectsModule, ProjectsService } from '../projects/projects.module';
@Controller('dashboard')
@ApiTags('Panel')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Roles('manager', 'admin')
export class ReportingController {
  constructor(
    private readonly db: DatabaseService,
    private readonly projects: ProjectsService,
  ) {}
  @Get() async dashboard() {
    const counts = (
      await this.db.query(`SELECT
      (SELECT count(*)::int FROM projects WHERE status IN ('planned','in_progress','on_hold')) AS "activeProjects",
      (SELECT count(*)::int FROM attendance_records WHERE check_out_at IS NULL) AS "presentEmployees",
      (SELECT count(DISTINCT task_id)::int FROM work_sessions WHERE ended_at IS NULL) AS "activeTasks",
      (SELECT COALESCE(sum(planned_minutes),0)::int FROM tasks WHERE status<>'cancelled') AS "plannedMinutes",
      (SELECT COALESCE(floor(sum(EXTRACT(epoch FROM (COALESCE(ended_at,CURRENT_TIMESTAMP)-started_at)))/60),0)::int FROM work_sessions) AS "actualMinutes"`)
    ).rows[0];
    return { ...counts, projects: await this.projects.list(5) };
  }
}
@Module({ imports: [AuthModule, ProjectsModule], controllers: [ReportingController] })
export class ReportingModule {}
