import { Controller, Get, Module, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthModule, AuthRequest, SessionGuard } from '../auth/auth.module';
import { DatabaseService } from '../database/database.module';
import { ListQuery } from '../projects/projects.module';
@Controller('tasks')
@ApiTags('Zadania')
@ApiCookieAuth()
@UseGuards(SessionGuard)
export class TasksController {
  constructor(private readonly db: DatabaseService) {}
  @Get() async list(@Req() req: AuthRequest, @Query() q: ListQuery) {
    const worker = req.user.role === 'worker';
    return (
      await this.db.query(
        `SELECT t.id::text,t.name,t.status,t.sequence_no,t.planned_minutes,
      p.project_number,p.name AS project_name,s.name AS workstation_name,
      COALESCE((SELECT floor(sum(EXTRACT(epoch FROM (COALESCE(w.ended_at,CURRENT_TIMESTAMP)-w.started_at)))/60)
        FROM work_sessions w WHERE w.task_id=t.id AND ($1::boolean=false OR w.employee_id=$2::bigint)),0)::int AS actual_minutes,
      COALESCE((SELECT string_agg(u.first_name || ' ' || u.last_name, ', ' ORDER BY u.last_name)
        FROM task_assignments a JOIN employees e ON e.id=a.employee_id JOIN accounts_user u ON u.id=e.user_id
        WHERE a.task_id=t.id AND a.unassigned_at IS NULL AND ($1::boolean=false OR a.employee_id=$2::bigint)),'') AS assignees
      FROM tasks t JOIN projects p ON p.id=t.project_id JOIN workstations s ON s.id=t.workstation_id
      WHERE $1::boolean=false OR EXISTS (SELECT 1 FROM task_assignments mine WHERE mine.task_id=t.id AND mine.employee_id=$2::bigint AND mine.unassigned_at IS NULL)
      ORDER BY p.id DESC,t.sequence_no LIMIT $3 OFFSET $4`,
        [worker, req.user.employeeId, q.limit, q.offset],
      )
    ).rows;
  }
}
@Module({ imports: [AuthModule], controllers: [TasksController] })
export class TasksModule {}
