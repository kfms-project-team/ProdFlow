import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { CurrentUser, Role } from '@prodflow/contracts';
import { hashPassword, verifyPassword } from '@prodflow/database';
import { DatabaseService } from '../database/database.module';
export interface AuthRequest extends Request {
  user: CurrentUser;
}
const COOKIE = 'prodflow_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export class LoginDto {
  @ApiProperty({ example: 'kierownik' }) @IsString() @Length(1, 150) username!: string;
  @ApiProperty({ format: 'password' }) @IsString() @Length(1, 256) password!: string;
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.[COOKIE];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Zaloguj się ponownie.');
    const rows = (
      await this.db.query(
        `SELECT u.id::text, u.username, u.first_name AS "firstName", u.last_name AS "lastName", u.role,
      e.id::text AS "employeeId" FROM auth_sessions s JOIN accounts_user u ON u.id=s.user_id
      LEFT JOIN employees e ON e.user_id=u.id
      WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP AND u.is_active
      AND (u.role <> 'worker' OR (e.id IS NOT NULL AND e.is_active))`,
        [digest(token)],
      )
    ).rows;
    if (!rows[0]) throw new UnauthorizedException('Sesja wygasła lub konto jest nieaktywne.');
    req.user = rows[0];
    const allowed = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(req.user.role))
      throw new ForbiddenException('Brak uprawnień do tej operacji.');
    return true;
  }
}
@ApiTags('Sesja')
@Controller()
export class AuthController {
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(private readonly db: DatabaseService) {}
  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = (
      await this.db.query(
        `SELECT u.*, e.id AS employee_id, e.is_active AS employee_active FROM accounts_user u
      LEFT JOIN employees e ON e.user_id=u.id WHERE u.username=$1`,
        [dto.username],
      )
    ).rows[0];
    const correct = await verifyPassword(dto.password, user?.password || (await this.dummyHash));
    if (!correct || !user?.is_active || (user.role === 'worker' && !user.employee_active))
      throw new UnauthorizedException('Nieprawidłowy login lub hasło.');
    const token = randomBytes(32).toString('hex');
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM auth_sessions WHERE expires_at<CURRENT_TIMESTAMP');
      await tx.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,CURRENT_TIMESTAMP+interval '8 hours')",
        [digest(token), user.id],
      );
      await tx.query('UPDATE accounts_user SET last_login=CURRENT_TIMESTAMP WHERE id=$1', [
        user.id,
      ]);
    });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
      maxAge: 8 * 60 * 60 * 1000,
    });
    return { ok: true };
  }
  @Post('auth/logout')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.query('DELETE FROM auth_sessions WHERE token_hash=$1', [
      digest(req.cookies[COOKIE]),
    ]);
    res.clearCookie(COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
    });
    return { ok: true };
  }
  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  me(@Req() req: AuthRequest) {
    return req.user;
  }
}
@Module({ controllers: [AuthController], providers: [SessionGuard], exports: [SessionGuard] })
export class AuthModule {}
