// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Audit-Log für Workspace-Admins: Einträge filtern und Aufbewahrung einstellen.
import { hasPermission } from '../roles/role-store';
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { DEFAULT_AUDIT_RETENTION_DAYS, Lt4AuditService } from './lt4-audit.service';

class ListDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Genaues Ereignis ("page.created") oder Bereich ("page.") */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  event?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

class RetentionDto {
  @IsInt()
  @IsIn([30, 90, 180, 365, 730, 1825])
  days: number;
}

@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly audit: Lt4AuditService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private assertAdmin(user: User) {
    if (!hasPermission(user, 'audit')) throw new ForbiddenException();
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async list(@Body() dto: ListDto, @AuthUser() user: User) {
    this.assertAdmin(user);
    const limit = dto.limit ?? 50;
    let q = this.db
      .selectFrom('audit as a')
      .leftJoin('users as u', 'u.id', 'a.actorId')
      .leftJoin('spaces as s', 's.id', 'a.spaceId')
      .select([
        'a.id',
        'a.event',
        'a.resourceType',
        'a.resourceId',
        'a.spaceId',
        'a.actorId',
        'a.actorType',
        'a.metadata',
        'a.changes',
        'a.ipAddress',
        'a.userAgent',
        'a.createdAt',
        'u.name as actorName',
        'u.avatarUrl as actorAvatarUrl',
        's.name as spaceName',
      ])
      .where('a.workspaceId', '=', user.workspaceId)
      .orderBy('a.id', 'desc')
      .limit(limit + 1);
    if (dto.cursor) q = q.where('a.id', '<', dto.cursor);
    if (dto.event) {
      q = dto.event.endsWith('.')
        ? q.where('a.event', 'like', `${dto.event.replace(/[%_]/g, '')}%`)
        : q.where('a.event', '=', dto.event);
    }
    if (dto.actorId) q = q.where('a.actorId', '=', dto.actorId);
    if (dto.spaceId) q = q.where('a.spaceId', '=', dto.spaceId);
    if (dto.from) q = q.where('a.createdAt', '>=', new Date(dto.from));
    if (dto.to) q = q.where('a.createdAt', '<=', new Date(dto.to));

    const rows = await q.execute();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      event: r.event,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      actorType: r.actorType,
      actor: r.actorId ? { id: r.actorId, name: r.actorName, avatarUrl: r.actorAvatarUrl } : null,
      metadata: r.metadata,
      changes: r.changes,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  /** Ereignisse, die in diesem Workspace vorkommen (für den Filter). */
  @HttpCode(HttpStatus.OK)
  @Post('events')
  async events(@AuthUser() user: User) {
    this.assertAdmin(user);
    const rows = await this.db
      .selectFrom('audit')
      .select('event')
      .distinct()
      .where('workspaceId', '=', user.workspaceId)
      .execute();
    return rows.map((r) => r.event).sort();
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings')
  async settings(@AuthUser() user: User) {
    this.assertAdmin(user);
    const ws = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', user.workspaceId)
      .executeTakeFirst();
    return {
      retentionDays: Number(ws?.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS),
      defaultRetentionDays: DEFAULT_AUDIT_RETENTION_DAYS,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings/update')
  async updateSettings(@Body() dto: RetentionDto, @AuthUser() user: User) {
    this.assertAdmin(user);
    await this.audit.updateRetention(user.workspaceId, dto.days);
    this.auditService.log({
      event: AuditEvent.WORKSPACE_UPDATED,
      resourceType: AuditResource.WORKSPACE,
      resourceId: user.workspaceId,
      changes: { after: { auditRetentionDays: dto.days } },
    });
    return this.settings(user);
  }
}
