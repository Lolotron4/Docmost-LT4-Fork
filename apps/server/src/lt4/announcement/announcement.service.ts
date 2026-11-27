// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Ankündigungs-Banner: Admins legen Hinweise an, die oben in der App
// (und bei Zielgruppe "everyone" auch auf Login- und öffentlichen Seiten) erscheinen.
import { hasPermission } from '../roles/role-store';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './announcement.dto';

const PUBLIC_FIELDS = [
  'id',
  'title',
  'textContent',
  'color',
  'audience',
  'isDismissible',
  'startsAt',
  'endsAt',
  'updatedAt',
] as const;

export function announcementText(text?: string | null): string {
  return (text ?? '').replace(/\r\n/g, '\n').trim();
}

@Injectable()
export class AnnouncementService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private assertAdmin(user: User) {
    if (!hasPermission(user, 'announcements')) {
      throw new ForbiddenException();
    }
  }

  private checkDates(startsAt?: string | Date | null, endsAt?: string | Date | null) {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('The end must be after the start');
    }
  }

  /** Gerade sichtbare Ankündigungen (eingeloggt: alle Zielgruppen). */
  async current(workspaceId: string | null, loggedIn: boolean) {
    if (!workspaceId) return [];
    let q = this.db
      .selectFrom('announcements')
      .select(PUBLIC_FIELDS as any)
      .where('workspaceId', '=', workspaceId)
      .where('archivedAt', 'is', null)
      .where('startsAt', '<=', sql<Date>`now()`)
      .where((eb) => eb.or([eb('endsAt', 'is', null), eb('endsAt', '>', sql<Date>`now()`)]));
    if (!loggedIn) q = q.where('audience', '=', 'everyone');
    return q.orderBy('startsAt', 'desc').orderBy('id', 'desc').limit(5).execute();
  }

  async list(user: User, workspace: Workspace, archived = false) {
    this.assertAdmin(user);
    return this.db
      .selectFrom('announcements')
      .selectAll()
      .select(sql<string>`(select name from users where users.id = announcements.creator_id)`.as('creatorName'))
      .where('workspaceId', '=', workspace.id)
      .where('archivedAt', archived ? 'is not' : 'is', null)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute();
  }

  private async find(workspaceId: string, id: string) {
    const row = await this.db
      .selectFrom('announcements')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Announcement not found');
    return row;
  }

  async create(user: User, workspace: Workspace, dto: CreateAnnouncementDto) {
    this.assertAdmin(user);
    this.checkDates(dto.startsAt, dto.endsAt);
    const text = announcementText(dto.text);
    return this.db
      .insertInto('announcements')
      .values({
        workspaceId: workspace.id,
        type: 'banner',
        color: dto.color ?? 'blue',
        title: dto.title.trim(),
        content: { text } as any,
        textContent: text,
        audience: dto.audience ?? 'members',
        isDismissible: dto.isDismissible ?? true,
        ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        creatorId: user.id,
        lastUpdatedById: user.id,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async update(user: User, workspace: Workspace, dto: UpdateAnnouncementDto) {
    this.assertAdmin(user);
    const existing = await this.find(workspace.id, dto.announcementId);
    const startsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt =
      dto.endsAt === undefined ? existing.endsAt : dto.endsAt ? new Date(dto.endsAt) : null;
    this.checkDates(startsAt as any, endsAt as any);
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
      lastUpdatedById: user.id,
      startsAt,
      endsAt,
    };
    if (dto.title !== undefined) values.title = dto.title.trim();
    if (dto.text !== undefined) {
      const text = announcementText(dto.text);
      values.content = { text };
      values.textContent = text;
    }
    if (dto.color !== undefined) values.color = dto.color;
    if (dto.audience !== undefined) values.audience = dto.audience;
    if (dto.isDismissible !== undefined) values.isDismissible = dto.isDismissible;
    return this.db
      .updateTable('announcements')
      .set(values as any)
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirst();
  }

  async archive(user: User, workspace: Workspace, id: string, archived: boolean) {
    this.assertAdmin(user);
    const existing = await this.find(workspace.id, id);
    return this.db
      .updateTable('announcements')
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), lastUpdatedById: user.id })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirst();
  }

  async remove(user: User, workspace: Workspace, id: string) {
    this.assertAdmin(user);
    const existing = await this.find(workspace.id, id);
    await this.db.deleteFrom('announcements').where('id', '=', existing.id).execute();
  }
}
