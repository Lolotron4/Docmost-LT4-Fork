// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PROPERTY_TYPES, PropertyType, VIEW_TYPES, ViewType } from './base.util';

export const BASE_TEMPLATES = ['table', 'kanban', 'calendar', 'form'] as const;
export type BaseTemplateName = (typeof BASE_TEMPLATES)[number];

export class CreateBaseDto {
  @IsOptional()
  @IsUUID()
  parentPageId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsIn(BASE_TEMPLATES)
  template?: BaseTemplateName;
}

export class ConvertToBaseDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsIn(BASE_TEMPLATES)
  template?: BaseTemplateName;
}

export class BasePageDto {
  @IsUUID()
  pageId: string;
}

export class CreatePropertyDto extends BasePageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsIn(PROPERTY_TYPES)
  type: PropertyType;

  @IsOptional()
  @IsObject()
  typeOptions?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  afterPropertyId?: string;
}

export class UpdatePropertyDto extends BasePageDto {
  @IsString()
  propertyId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(PROPERTY_TYPES)
  type?: PropertyType;

  @IsOptional()
  @IsObject()
  typeOptions?: Record<string, unknown>;
}

export class PropertyIdDto extends BasePageDto {
  @IsString()
  propertyId: string;
}

export class MovePropertyDto extends PropertyIdDto {
  /** Eigenschaft, hinter die verschoben wird; leer = an den Anfang. */
  @IsOptional()
  @IsString()
  afterPropertyId?: string | null;
}

export class CreateRowDto extends BasePageDto {
  @IsOptional()
  @IsObject()
  cells?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  afterRowId?: string;

  @IsOptional()
  @IsBoolean()
  atStart?: boolean;
}

export class UpdateRowDto extends BasePageDto {
  @IsUUID()
  rowId: string;

  /** Nur die genannten Zellen werden geändert; null leert eine Zelle. */
  @IsObject()
  cells: Record<string, unknown>;
}

export class DeleteRowsDto extends BasePageDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  rowIds: string[];
}

export class MoveRowDto extends BasePageDto {
  @IsUUID()
  rowId: string;

  @IsOptional()
  @IsUUID()
  beforeRowId?: string | null;

  @IsOptional()
  @IsUUID()
  afterRowId?: string | null;
}

export class CreateViewDto extends BasePageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsIn(VIEW_TYPES)
  type: ViewType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateViewDto extends BasePageDto {
  @IsUUID()
  viewId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ViewIdDto extends BasePageDto {
  @IsUUID()
  viewId: string;
}
