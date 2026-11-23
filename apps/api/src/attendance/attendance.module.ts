import { Controller, Get, Module, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AuthModule, AuthRequest, SessionGuard } from '../auth/auth.module';
import { DatabaseService } from '../database/database.module';
import { ListQuery } from '../projects/projects.module';
@Controller('attendance')
@ApiTags('Obecności')
@ApiCookieAuth()
@UseGuards(SessionGuard)
export class AttendanceController {
  constructor(private readonly db: DatabaseService) {}
  @Get() async list(@Req() req: AuthRequest, @Query() q: ListQuery) {
    return (
      await this.db.query(
        `SELECT a.id::text,e.employee_number,u.first_name || ' ' || u.last_name AS employee_name,
      a.check_in_at,a.check_out_at,EXISTS(SELECT 1 FROM attendance_breaks b WHERE b.attendance_id=a.id AND b.ended_at IS NULL) AS on_break
      FROM attendance_records a JOIN employees e ON e.id=a.employee_id JOIN accounts_user u ON u.id=e.user_id
      WHERE $1::boolean=false OR a.employee_id=$2::bigint
      ORDER BY a.check_in_at DESC LIMIT $3 OFFSET $4`,
        [req.user.role === 'worker', req.user.employeeId, q.limit, q.offset],
      )
    ).rows;
  }
}
@Module({ imports: [AuthModule], controllers: [AttendanceController] })
export class AttendanceModule {}
