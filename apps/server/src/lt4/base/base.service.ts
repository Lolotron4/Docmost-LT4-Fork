// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageService } from '../../core/page/services/page.service';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  BaseTemplateName,
  ConvertToBaseDto,
  CreateBaseDto,
  CreatePropertyDto,
  CreateRowDto,
  CreateViewDto,
  MovePropertyDto,
  MoveRowDto,
  UpdatePropertyDto,
  UpdateRowDto,
  UpdateViewDto,
} from './base.dto';
import {
  convertCells,

  PropertyType,
  sanitizeCell,
  sanitizeTypeOptions,
  sanitizeViewConfig,
  shortId,
  ViewType,
} from './base.util';

const MAX_ROWS = 5000;
const MAX_PROPERTIES = 100;
const MAX_VIEWS = 30;

type PropertyRow = {
  id: string;
  name: string;
  type: PropertyType;
  position: string;
  typeOptions: unknown;
  isPrimary: boolean;
};

// Objekte direkt übergeben: pg speichert sie als JSON (Strings würden doppelt kodiert).
const json = (value: unknown) => (value ?? null) as any;

/** Nur leere Absätze (oder gar kein Inhalt)? Bilder, Tabellen usw. zählen als Inhalt. */
function isEmptyDoc(content: unknown): boolean {
  const nodes = (content as any)?.content;
  if (!Array.isArray(nodes)) return true;
  return nodes.every(
    (n: any) => n?.type === 'paragraph' && (!Array.isArray(n.content) || n.content.length === 0),
  );
}

@Injectable()
export class BaseService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  // ------------------------------------------------------------ Anlegen

  async create(user: User, workspaceId: string, dto: CreateBaseDto) {
    let spaceId = dto.spaceId;
    if (dto.parentPageId) {
      const parent = await this.pageRepo.findById(dto.parentPageId);
      if (!parent || parent.deletedAt || parent.workspaceId !== workspaceId) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccess.validateCanEdit(parent, user);
      spaceId = parent.spaceId;
    } else {
      if (!spaceId) throw new BadRequestException('spaceId or parentPageId is required');
      const ability = await this.spaceAbility.createForUser(user, spaceId);
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const page = await executeTx(this.db, async (trx) => {
      const created = await this.pageService.create(
        user.id,
        workspaceId,
        { title: dto.title, parentPageId: dto.parentPageId, spaceId },
        trx,
        true,
      );
      await this.applyTemplate(trx, created, user, dto.template);
      return created;
    });
    return { id: page.id, slugId: page.slugId, spaceId: page.spaceId };
  }

  /** Leere Seite in eine Datenbank umwandeln. */
  async convert(user: User, workspaceId: string, dto: ConvertToBaseDto) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
      includeTextContent: true,
    });
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanEdit(page, user);
    if (page.isBase) return { id: page.id, slugId: page.slugId };
    if ((page.textContent ?? '').trim().length > 0 || !isEmptyDoc(page.content)) {
      throw new BadRequestException('Only empty pages can be turned into a database');
    }
    await executeTx(this.db, async (trx) => {
      await trx
        .updateTable('pages')
        .set({ isBase: true, updatedAt: new Date(), lastUpdatedById: user.id })
        .where('id', '=', page.id)
        .execute();
      await this.applyTemplate(trx, page, user, dto.template);
    });
    return { id: page.id, slugId: page.slugId };
  }

  private async applyTemplate(
    trx: KyselyTransaction,
    page: Pick<Page, 'id' | 'workspaceId'>,
    user: User,
    template: BaseTemplateName = 'table',
  ) {
    const de = (user.locale ?? '').toLowerCase().startsWith('de');
    const L = (deText: string, enText: string) => (de ? deText : enText);
    const base = { pageId: page.id, workspaceId: page.workspaceId };

    const props: { id: string; name: string; type: PropertyType; typeOptions?: unknown; isPrimary?: boolean }[] = [
      { id: shortId('p'), name: L('Name', 'Name'), type: 'text', isPrimary: true },
    ];
    let statusId: string | null = null;
    let dateId: string | null = null;
    if (template === 'kanban') {
      statusId = shortId('p');
      props.push({
        id: statusId,
        name: 'Status',
        type: 'select',
        typeOptions: {
          options: [
            { id: shortId('o'), name: L('Zu erledigen', 'To do'), color: 'gray' },
            { id: shortId('o'), name: L('In Arbeit', 'In progress'), color: 'blue' },
            { id: shortId('o'), name: L('Erledigt', 'Done'), color: 'green' },
          ],
        },
      });
      props.push({ id: shortId('p'), name: L('Zuständig', 'Assignee'), type: 'text' });
    } else if (template === 'calendar') {
      dateId = shortId('p');
      props.push({ id: dateId, name: L('Datum', 'Date'), type: 'date' });
      props.push({ id: shortId('p'), name: L('Notizen', 'Notes'), type: 'text' });
    } else {
      props.push({ id: shortId('p'), name: L('Tags', 'Tags'), type: 'multiSelect', typeOptions: { options: [] } });
      props.push({ id: shortId('p'), name: L('Notizen', 'Notes'), type: 'text' });
    }

    let pos: string | null = null;
    for (const p of props) {
      pos = generateJitteredKeyBetween(pos, null);
      await trx
        .insertInto('baseProperties')
        .values({
          ...base,
          id: p.id,
          name: p.name,
          type: p.type,
          position: pos,
          typeOptions: p.typeOptions ? json(p.typeOptions) : null,
          isPrimary: !!p.isPrimary,
        })
        .execute();
    }

    const views: { name: string; type: ViewType; config: Record<string, unknown> }[] = [];
    if (template === 'kanban') {
      views.push({ name: L('Board', 'Board'), type: 'kanban', config: { groupByPropertyId: statusId } });
    } else if (template === 'calendar') {
      views.push({ name: L('Kalender', 'Calendar'), type: 'calendar', config: { datePropertyId: dateId } });
    }
    views.push({ name: L('Tabelle', 'Table'), type: 'table', config: {} });

    pos = null;
    for (const v of views) {
      pos = generateJitteredKeyBetween(pos, null);
      await trx
        .insertInto('baseViews')
        .values({ ...base, name: v.name, type: v.type, position: pos, config: json(v.config), creatorId: user.id })
        .execute();
    }

    if (template === 'table' || template === 'form') {
      pos = null;
      for (let i = 0; i < 3; i++) {
        pos = generateJitteredKeyBetween(pos, null);
        await trx
          .insertInto('baseRows')
          .values({ ...base, position: pos, cells: json({}), creatorId: user.id, lastUpdatedById: user.id })
          .execute();
      }
    }
  }

  // ------------------------------------------------------------ Lesen

  async info(user: User, workspaceId: string, pageId: string) {
    const page = await this.findBasePage(workspaceId, pageId);
    const { canEdit } = await this.pageAccess.validateCanViewWithPermissions(page, user);
    const [properties, views] = await Promise.all([
      this.listProperties(page.id),
      this.db
        .selectFrom('baseViews')
        .select(['id', 'name', 'type', 'position', 'config'])
        .where('pageId', '=', page.id)
        .orderBy(sql`position collate "C"`)
        .orderBy('id')
        .execute(),
    ]);
    return {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      icon: page.icon,
      spaceId: page.spaceId,
      properties,
      views,
      permissions: { canEdit },
    };
  }

  async rows(user: User, workspaceId: string, pageId: string) {
    const page = await this.findBasePage(workspaceId, pageId);
    await this.pageAccess.validateCanView(page, user);
    const items = await this.db
      .selectFrom('baseRows')
      .select(['id', 'cells', 'position', 'createdAt', 'updatedAt', 'creatorId', 'lastUpdatedById'])
      .where('pageId', '=', page.id)
      .where('deletedAt', 'is', null)
      .orderBy(sql`position collate "C"`)
      .orderBy('id')
      .limit(MAX_ROWS)
      .execute();
    return { items };
  }

  // ------------------------------------------------------- Eigenschaften

  async createProperty(user: User, workspaceId: string, dto: CreatePropertyDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const props = await this.listProperties(page.id);
    if (props.length >= MAX_PROPERTIES) throw new BadRequestException('Too many properties');
    const name = await this.uniqueName(props, dto.name);

    const idx = dto.afterPropertyId ? props.findIndex((p) => p.id === dto.afterPropertyId) : props.length - 1;
    const before = props[idx]?.position ?? null;
    const after = props[idx + 1]?.position ?? null;
    const id = shortId('p');
    await this.db
      .insertInto('baseProperties')
      .values({
        id,
        pageId: page.id,
        workspaceId,
        name,
        type: dto.type,
        position: generateJitteredKeyBetween(before, after),
        typeOptions: json(sanitizeTypeOptions(dto.type, dto.typeOptions)),
      })
      .execute();
    return (await this.listProperties(page.id)).find((p) => p.id === id);
  }

  async updateProperty(user: User, workspaceId: string, dto: UpdatePropertyDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const props = await this.listProperties(page.id);
    const prop = props.find((p) => p.id === dto.propertyId);
    if (!prop) throw new NotFoundException('Property not found');

    const name = dto.name !== undefined && dto.name.trim() !== prop.name
      ? await this.uniqueName(props.filter((p) => p.id !== prop.id), dto.name)
      : prop.name;
    const newType = dto.type ?? prop.type;
    if (prop.isPrimary && newType !== 'text') {
      throw new BadRequestException('The first column is always text');
    }
    let typeOptions =
      dto.typeOptions !== undefined
        ? sanitizeTypeOptions(newType, dto.typeOptions)
        : newType === prop.type
          ? (prop.typeOptions as any)
          : sanitizeTypeOptions(newType, {});

    await executeTx(this.db, async (trx) => {
      if (newType !== prop.type || dto.typeOptions !== undefined) {
        const rows = await trx
          .selectFrom('baseRows')
          .select(['id', 'cells'])
          .where('pageId', '=', page.id)
          .where(sql`cells ? ${prop.id}` as any)
          .forUpdate()
          .execute();
        const old = rows.map((r) => (r.cells as any)?.[prop.id]);
        let values = old;
        if (newType !== prop.type) {
          const converted = convertCells(
            { type: prop.type, typeOptions: prop.typeOptions },
            { type: newType, typeOptions },
            old,
          );
          values = converted.values;
          typeOptions = converted.typeOptions;
        }
        for (let i = 0; i < rows.length; i++) {
          const clean = sanitizeCell(newType, typeOptions, values[i]);
          if (JSON.stringify(clean) === JSON.stringify(old[i])) continue;
          const cells = { ...(rows[i].cells as object) } as Record<string, unknown>;
          if (clean === undefined) delete cells[prop.id];
          else cells[prop.id] = clean;
          await trx
            .updateTable('baseRows')
            .set({ cells: json(cells), updatedAt: new Date(), lastUpdatedById: user.id })
            .where('id', '=', rows[i].id)
            .execute();
        }
      }
      await trx
        .updateTable('baseProperties')
        .set({ name, type: newType, typeOptions: json(typeOptions), updatedAt: new Date() })
        .where('pageId', '=', page.id)
        .where('id', '=', prop.id)
        .execute();
    });
    return (await this.listProperties(page.id)).find((p) => p.id === prop.id);
  }

  async deleteProperty(user: User, workspaceId: string, pageId: string, propertyId: string) {
    const page = await this.editablePage(user, workspaceId, pageId);
    const prop = (await this.listProperties(page.id)).find((p) => p.id === propertyId);
    if (!prop) throw new NotFoundException('Property not found');
    if (prop.isPrimary) throw new BadRequestException('The first column cannot be deleted');
    await executeTx(this.db, async (trx) => {
      await trx
        .deleteFrom('baseProperties')
        .where('pageId', '=', page.id)
        .where('id', '=', prop.id)
        .execute();
      await trx
        .updateTable('baseRows')
        .set({ cells: sql`cells - ${prop.id}` })
        .where('pageId', '=', page.id)
        .where(sql`cells ? ${prop.id}` as any)
        .execute();
    });
  }

  async moveProperty(user: User, workspaceId: string, dto: MovePropertyDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const props = (await this.listProperties(page.id)).filter((p) => p.id !== dto.propertyId);
    const prop = (await this.listProperties(page.id)).find((p) => p.id === dto.propertyId);
    if (!prop) throw new NotFoundException('Property not found');
    const idx = dto.afterPropertyId ? props.findIndex((p) => p.id === dto.afterPropertyId) : -1;
    // Die erste Spalte (Name) bleibt vorne.
    const safeIdx = Math.max(idx, prop.isPrimary ? -1 : props.findIndex((p) => p.isPrimary));
    const position = generateJitteredKeyBetween(
      props[safeIdx]?.position ?? null,
      props[safeIdx + 1]?.position ?? null,
    );
    await this.db
      .updateTable('baseProperties')
      .set({ position, updatedAt: new Date() })
      .where('pageId', '=', page.id)
      .where('id', '=', prop.id)
      .execute();
  }

  // ------------------------------------------------------------- Zeilen

  async createRow(user: User, workspaceId: string, dto: CreateRowDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const count = await this.db
      .selectFrom('baseRows')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('pageId', '=', page.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (Number(count?.n ?? 0) >= MAX_ROWS) throw new BadRequestException('Too many rows');

    const props = await this.listProperties(page.id);
    const cells = this.cleanCells(props, {}, dto.cells ?? {});
    const position = await this.positionFor(page.id, dto);
    return this.db
      .insertInto('baseRows')
      .values({
        pageId: page.id,
        workspaceId,
        position,
        cells: json(cells),
        creatorId: user.id,
        lastUpdatedById: user.id,
      })
      .returning(['id', 'cells', 'position', 'createdAt', 'updatedAt', 'creatorId', 'lastUpdatedById'])
      .executeTakeFirst();
  }

  async updateRow(user: User, workspaceId: string, dto: UpdateRowDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const props = await this.listProperties(page.id);
    return executeTx(this.db, async (trx) => {
      const row = await trx
        .selectFrom('baseRows')
        .select(['id', 'cells'])
        .where('id', '=', dto.rowId)
        .where('pageId', '=', page.id)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!row) throw new NotFoundException('Row not found');
      const cells = this.cleanCells(props, (row.cells as any) ?? {}, dto.cells);
      return trx
        .updateTable('baseRows')
        .set({ cells: json(cells), updatedAt: new Date(), lastUpdatedById: user.id })
        .where('id', '=', row.id)
        .returning(['id', 'cells', 'position', 'createdAt', 'updatedAt', 'creatorId', 'lastUpdatedById'])
        .executeTakeFirst();
    });
  }

  async deleteRows(user: User, workspaceId: string, pageId: string, rowIds: string[]) {
    const page = await this.editablePage(user, workspaceId, pageId);
    if (!rowIds.length) return;
    await this.db
      .deleteFrom('baseRows')
      .where('pageId', '=', page.id)
      .where('id', 'in', rowIds)
      .execute();
  }

  async moveRow(user: User, workspaceId: string, dto: MoveRowDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const position = await this.positionFor(page.id, dto, dto.rowId);
    const res = await this.db
      .updateTable('baseRows')
      .set({ position })
      .where('id', '=', dto.rowId)
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows ?? 0) === 0) throw new NotFoundException('Row not found');
    return { position };
  }

  // ------------------------------------------------------------ Ansichten

  async createView(user: User, workspaceId: string, dto: CreateViewDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const last = await this.db
      .selectFrom('baseViews')
      .select(['position'])
      .where('pageId', '=', page.id)
      .orderBy(sql`position collate "C"`, 'desc')
      .execute();
    if (last.length >= MAX_VIEWS) throw new BadRequestException('Too many views');
    return this.db
      .insertInto('baseViews')
      .values({
        pageId: page.id,
        workspaceId,
        name: dto.name.trim(),
        type: dto.type,
        position: generateJitteredKeyBetween(last[0]?.position ?? null, null),
        config: json(sanitizeViewConfig(dto.config)),
        creatorId: user.id,
      })
      .returning(['id', 'name', 'type', 'position', 'config'])
      .executeTakeFirst();
  }

  async updateView(user: User, workspaceId: string, dto: UpdateViewDto) {
    const page = await this.editablePage(user, workspaceId, dto.pageId);
    const view = await this.db
      .updateTable('baseViews')
      .set({
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.config !== undefined ? { config: json(sanitizeViewConfig(dto.config)) } : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', dto.viewId)
      .where('pageId', '=', page.id)
      .returning(['id', 'name', 'type', 'position', 'config'])
      .executeTakeFirst();
    if (!view) throw new NotFoundException('View not found');
    return view;
  }

  async deleteView(user: User, workspaceId: string, pageId: string, viewId: string) {
    const page = await this.editablePage(user, workspaceId, pageId);
    const views = await this.db
      .selectFrom('baseViews')
      .select('id')
      .where('pageId', '=', page.id)
      .execute();
    if (!views.some((v) => v.id === viewId)) throw new NotFoundException('View not found');
    if (views.length <= 1) throw new BadRequestException('A database needs at least one view');
    await this.db.deleteFrom('baseViews').where('id', '=', viewId).execute();
  }

  // -------------------------------------------------------------- Intern

  private async findBasePage(workspaceId: string, pageId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId || !page.isBase) {
      throw new NotFoundException('Database not found');
    }
    return page;
  }

  private async editablePage(user: User, workspaceId: string, pageId: string) {
    const page = await this.findBasePage(workspaceId, pageId);
    await this.pageAccess.validateCanEdit(page, user);
    return page;
  }

  private async listProperties(pageId: string): Promise<PropertyRow[]> {
    const rows = await this.db
      .selectFrom('baseProperties')
      .select(['id', 'name', 'type', 'position', 'typeOptions', 'isPrimary'])
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy('isPrimary', 'desc')
      .orderBy(sql`position collate "C"`)
      .orderBy('id')
      .execute();
    return rows as PropertyRow[];
  }

  private async uniqueName(props: PropertyRow[], wanted: string) {
    const base = wanted.trim().slice(0, 200) || 'Property';
    const taken = new Set(props.map((p) => p.name.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${shortId()}`;
  }

  private cleanCells(
    props: PropertyRow[],
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) {
    const byId = new Map(props.map((p) => [p.id, p]));
    // Zellen gelöschter Eigenschaften fallen weg.
    const cells: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(current)) if (byId.has(k)) cells[k] = v;
    for (const [k, v] of Object.entries(patch)) {
      const prop = byId.get(k);
      if (!prop) continue;
      const clean = sanitizeCell(prop.type, prop.typeOptions, v);
      if (clean === undefined) delete cells[k];
      else cells[k] = clean;
    }
    return cells;
  }

  private async positionFor(
    pageId: string,
    opts: { afterRowId?: string | null; beforeRowId?: string | null; atStart?: boolean },
    excludeId?: string,
  ): Promise<string> {
    const rows = (
      await this.db
        .selectFrom('baseRows')
        .select(['id', 'position'])
        .where('pageId', '=', pageId)
        .where('deletedAt', 'is', null)
        .orderBy(sql`position collate "C"`)
        .orderBy('id')
        .execute()
    ).filter((r) => r.id !== excludeId);

    let idx: number; // neue Zeile kommt nach rows[idx]
    if (opts.afterRowId) {
      idx = rows.findIndex((r) => r.id === opts.afterRowId);
      if (idx < 0) idx = rows.length - 1;
    } else if (opts.beforeRowId) {
      idx = rows.findIndex((r) => r.id === opts.beforeRowId) - 1;
      if (idx < -1) idx = rows.length - 1;
    } else {
      idx = opts.atStart ? -1 : rows.length - 1;
    }
    const a = rows[idx]?.position ?? null;
    const b = rows[idx + 1]?.position ?? null;
    try {
      return generateJitteredKeyBetween(a, b);
    } catch {
      // Gleiche Positionen (z. B. nach Import): ans Ende hängen.
      return generateJitteredKeyBetween(rows[rows.length - 1]?.position ?? null, null);
    }
  }
}

