// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Sicherungen. Nur mit dem Rollenrecht "backups" (Owner
// immer) und nur mit einer normalen Anmeldung, nicht per API-Schlüssel.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import * as bytes from 'bytes';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import { User } from '@docmost/db/types/entity.types';
import { JwtType } from '../../core/auth/dto/jwt-payload';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditEventType, AuditResource } from '../../common/events/audit-events';
import { hasPermission } from '../roles/role-store';
import { BackupService } from './backup.service';

const ID_PATTERN = /^lt4-backup-[0-9A-Za-z_-]+$/;

class IdDto {
  @IsString()
  @Matches(ID_PATTERN)
  id: string;
}

class CreateDto {
  @IsOptional()
  @IsBoolean()
  includeFiles?: boolean;
}

class RestoreDto extends IdDto {
  @IsOptional()
  @IsBoolean()
  restoreFiles?: boolean;

  /** Muss "RESTORE" sein – Schutz vor versehentlichen Aufrufen. */
  @IsString()
  @IsIn(['RESTORE'])
  confirm: string;
}

class SettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['daily', 'weekly'])
  frequency?: 'daily' | 'weekly';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  keep?: number;

  @IsOptional()
  @IsBoolean()
  includeFiles?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('lt4-backups')
export class BackupController {
  constructor(
    private readonly backups: BackupService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private assertAllowed(req: any): User {
    const user: User = req?.user?.user;
    if (!user || req.user.authType !== JwtType.ACCESS) throw new ForbiddenException();
    if (!hasPermission(user, 'backups')) throw new ForbiddenException();
    return user;
  }

  private async overview() {
    const settings = await this.backups.getSettings();
    return {
      backups: await this.backups.list(),
      settings,
      nextRun: this.backups.nextRun(settings),
      status: this.backups.getStatus(),
      filesSupported: this.backups.filesSupported,
      disk: await this.backups.diskInfo(),
    };
  }

  private log(event: AuditEventType, id: string | null, metadata: Record<string, any> = {}) {
    this.auditService.log({
      event,
      resourceType: AuditResource.BACKUP,
      metadata: { ...(id ? { fileName: `${id}.tar.gz` } : {}), ...metadata },
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async list(@Req() req: any) {
    this.assertAllowed(req);
    return this.overview();
  }

  @HttpCode(HttpStatus.OK)
  @Post('status')
  async status(@Req() req: any) {
    this.assertAllowed(req);
    return this.backups.getStatus();
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(@Body() dto: CreateDto, @Req() req: any) {
    const user = this.assertAllowed(req);
    try {
      const id = this.backups.startBackup({
        kind: 'manual',
        includeFiles: dto.includeFiles ?? true,
        createdBy: user.name || user.email,
      });
      this.log(AuditEvent.BACKUP_CREATED, id);
      return { id, status: this.backups.getStatus() };
    } catch (err: any) {
      throw new ConflictException(err?.message);
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings')
  async saveSettings(@Body() dto: SettingsDto, @Req() req: any) {
    this.assertAllowed(req);
    if (dto.timeZone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timeZone });
      } catch {
        throw new BadRequestException('Unknown time zone');
      }
    }
    await this.backups.saveSettings({
      ...dto,
      // Zeitplan geändert: heute darf wieder laufen
      lastScheduledKey: null,
    });
    const settings = await this.backups.getSettings();
    if (dto.keep) await this.backups.applyRetention(settings.keep);
    this.log(AuditEvent.BACKUP_SETTINGS_UPDATED, null, {
      enabled: settings.enabled,
      frequency: settings.frequency,
      hour: settings.hour,
      keep: settings.keep,
    });
    return this.overview();
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(@Body() dto: IdDto, @Req() req: any) {
    this.assertAllowed(req);
    if (!(await this.backups.find(dto.id))) throw new NotFoundException();
    await this.backups.remove(dto.id);
    this.log(AuditEvent.BACKUP_DELETED, dto.id);
    return this.overview();
  }

  @HttpCode(HttpStatus.OK)
  @Post('restore')
  async restore(@Body() dto: RestoreDto, @Req() req: any) {
    const user = this.assertAllowed(req);
    if (!(await this.backups.find(dto.id))) throw new NotFoundException();
    try {
      await this.backups.readManifest(this.backups.filePath(dto.id));
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Invalid backup');
    }
    try {
      this.backups.startRestore(
        dto.id,
        { restoreFiles: dto.restoreFiles ?? true, createdBy: user.name || user.email },
        // Landet im Audit-Log des wiederhergestellten Stands
        () =>
          this.auditService.logWithContext(
            {
              event: AuditEvent.BACKUP_RESTORED,
              resourceType: AuditResource.BACKUP,
              metadata: { fileName: `${dto.id}.tar.gz`, restoredBy: user.name || user.email },
            },
            { workspaceId: user.workspaceId, actorType: 'system' },
          ),
      );
    } catch (err: any) {
      throw new ConflictException(err?.message);
    }
    return { status: this.backups.getStatus() };
  }

  @Get('download/:id')
  async download(@Param('id') id: string, @Req() req: any, @Res() res: FastifyReply) {
    this.assertAllowed(req);
    if (!ID_PATTERN.test(id)) throw new NotFoundException();
    const info = await this.backups.find(id);
    if (!info) throw new NotFoundException();
    const file = this.backups.filePath(id);
    this.log(AuditEvent.BACKUP_DOWNLOADED, id);
    res.headers({
      'Content-Type': 'application/gzip',
      'Content-Length': String(info.size),
      'Content-Disposition': `attachment; filename="${info.fileName}"`,
      'Cache-Control': 'no-store',
    });
    return res.send(fs.createReadStream(file));
  }

  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('upload')
  async upload(@Req() req: any) {
    const user = this.assertAllowed(req);
    const limitText = process.env.LT4_BACKUP_UPLOAD_LIMIT || '20gb';
    const limit = bytes(limitText);

    let file: any = null;
    try {
      file = await req.file({ limits: { fileSize: limit, files: 1, fields: 0 } });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new PayloadTooLargeException(`File too large (limit ${limitText})`);
      }
    }
    if (!file) throw new BadRequestException('Failed to upload file');
    if (!/\.tar\.gz$|\.tgz$/i.test(file.filename ?? '')) {
      file.file.resume();
      throw new BadRequestException('Please upload an LT4 backup (.tar.gz)');
    }

    const id = this.backups.newId();
    const target = this.backups.filePath(id);
    const partial = target + '.partial';
    await fsp.mkdir(this.backups.backupDir, { recursive: true });
    try {
      await pipeline(file.file, fs.createWriteStream(partial));
      if (file.file.truncated) {
        throw new PayloadTooLargeException(`File too large (limit ${limitText})`);
      }
      await fsp.rename(partial, target);
    } catch (err: any) {
      await fsp.rm(partial, { force: true }).catch(() => undefined);
      if (err?.statusCode === 413 || err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new PayloadTooLargeException(`File too large (limit ${limitText})`);
      }
      throw err;
    }

    try {
      await this.backups.registerUploaded(id, user.name || user.email);
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Invalid backup');
    }
    this.log(AuditEvent.BACKUP_UPLOADED, id);
    return this.overview();
  }
}
