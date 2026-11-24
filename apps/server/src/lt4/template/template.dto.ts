// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

export class TemplateIdDto {
  @IsUUID()
  templateId: string;
}

export class ListTemplatesDto {
  /** Bereichs-ID, 'workspace' für nur allgemeine Vorlagen, leer = alle sichtbaren. */
  @IsOptional()
  @ValidateIf((o) => o.scope !== 'workspace')
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsIn(['workspace'])
  scope?: 'workspace';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  /** null/leer = Vorlage für den ganzen Workspace */
  @IsOptional()
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  /** Inhalt einer vorhandenen Seite als Vorlage übernehmen */
  @IsOptional()
  @IsUUID()
  fromPageId?: string;
}

export class UpdateTemplateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  /** undefined = unverändert, null = Workspace, UUID = Bereich */
  @IsOptional()
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}

export class UseTemplateDto {
  @IsUUID()
  templateId: string;

  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsObject()
  variableValues?: Record<string, string>;
}

export class CreatePageFromTemplateDto {
  @IsUUID()
  templateId: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  parentPageId?: string;

  @IsOptional()
  @IsObject()
  variableValues?: Record<string, string>;
}
