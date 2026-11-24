// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Persönliche Bereiche: jedes Mitglied kann (wenn im Workspace erlaubt) genau einen
// eigenen Bereich anlegen, in dem nur es selbst Mitglied ist.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceService } from '../../core/space/services/space.service';
import { generateSlugId } from '../../common/helpers';

export function personalSpacesAllowed(workspace: Pick<Workspace, 'settings'>): boolean {
  return (workspace?.settings as any)?.spaces?.allowPersonal === true;
}

export function personalSpaceName(user: Pick<User, 'name' | 'email'>, name?: string): string {
  const custom = name?.trim();
  if (custom) return custom.slice(0, 100);
  const owner = user.name?.trim() || user.email?.split('@')[0] || '';
  return (owner ? `Persönlich: ${owner}` : 'Persönlicher Bereich').slice(0, 100);
}

@Injectable()
export class PersonalSpaceService {
  constructor(
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceService: SpaceService,
  ) {}

  async mine(user: User, workspace: Workspace) {
    const space = await this.spaceRepo.findPersonalSpace(user.id, workspace.id);
    return space ?? null;
  }

  async create(user: User, workspace: Workspace, name?: string) {
    if (!personalSpacesAllowed(workspace)) {
      throw new ForbiddenException('Personal spaces are disabled in this workspace');
    }
    const existing = await this.spaceRepo.findPersonalSpace(user.id, workspace.id);
    if (existing) {
      throw new ConflictException('You already have a personal space');
    }

    // Kurzer, eindeutiger Slug (Bereichs-Slugs müssen alphanumerisch sein)
    let slug = '';
    for (let i = 0; i < 5 && !slug; i++) {
      const candidate = `p${generateSlugId().toLowerCase()}`.replace(/[^a-z0-9]/g, '').slice(0, 12);
      if (!(await this.spaceRepo.slugExists(candidate, workspace.id))) slug = candidate;
    }
    if (!slug) throw new BadRequestException('Could not create personal space');

    try {
      return await this.spaceService.createSpace(
        user,
        workspace.id,
        { name: personalSpaceName(user, name), slug, description: '' } as any,
        undefined,
        { isPersonal: true },
      );
    } catch (err: any) {
      // eindeutiger Index spaces_personal_creator_unique bei gleichzeitigen Anfragen
      if (err?.code === '23505') {
        throw new ConflictException('You already have a personal space');
      }
      throw err;
    }
  }
}
