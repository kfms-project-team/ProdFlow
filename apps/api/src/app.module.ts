import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseModule, DatabaseService } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ReportingModule } from './reporting/reporting.module';
@Controller('health')
@ApiTags('System')
class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Get() live() {
    return { status: 'ok', service: 'prodflow-api', version: '0.1.0' };
  }
  @Get('ready') async ready() {
    try {
      const result = await this.db.query('SELECT count(*)::int AS count FROM schema_migrations');
      if (result.rows[0].count < 2) throw new Error('Migrations missing');
      return { status: 'ok', database: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Baza nie jest gotowa. Uruchom migracje.');
    }
  }
}
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
    AttendanceModule,
    ReportingModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
