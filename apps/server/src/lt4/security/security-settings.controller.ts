// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '@docmost/db/types/entity.types';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { getPasswordPolicy, normalizePolicy } from './password-policy';

class PasswordPolicyDto {
  @IsInt()
  @Min(8)
  @Max(64)
  minLength: number;

  @IsBoolean()
  requireNumber: boolean;

  @IsBoolean()
  requireMixedCase: boolean;

  @IsBoolean()
  requireSymbol: boolean;
}

@Controller('security-settings')
export class SecuritySettingsController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /** Öffentlich, damit Registrierungs- und Passwortformulare die Regeln anzeigen können. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('password-policy')
  async publicPolicy(@Req() req: any) {
    const workspaceId = req.raw?.workspaceId;
    if (!workspaceId) return normalizePolicy(null);
    return getPasswordPolicy(this.db, workspaceId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('password-policy/update')
  async update(@Body() dto: PasswordPolicyDto, @AuthUser() user: User) {
    if (user.role !== 'admin' && user.role !== 'owner') throw new ForbiddenException();
    const before = await getPasswordPolicy(this.db, user.workspaceId);
    const policy = normalizePolicy(dto);
    await this.db
      .updateTable('workspaces')
      .set({
        settings: sql`jsonb_set(coalesce(settings, '{}'::jsonb), '{security}', coalesce(settings->'security', '{}'::jsonb) || jsonb_build_object('passwordPolicy', ${JSON.stringify(policy)}::text::jsonb))`,
      })
      .where('id', '=', user.workspaceId)
      .execute();
    this.auditService.log({
      event: AuditEvent.WORKSPACE_UPDATED,
      resourceType: AuditResource.WORKSPACE,
      resourceId: user.workspaceId,
      changes: { before: { passwordPolicy: before }, after: { passwordPolicy: policy } },
    });
    return policy;
  }
}
