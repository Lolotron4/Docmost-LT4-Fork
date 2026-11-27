import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum ExportFormat {
  HTML = 'html',
  Markdown = 'markdown',
  // LT4: verlustfreies Format des LT4-Docs Clients
  Lt4Docs = 'lt4docs',
}

export class ExportPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsIn(['html', 'markdown', 'lt4docs'])
  format: ExportFormat;

  @IsOptional()
  @IsBoolean()
  includeChildren?: boolean;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;
}

export class ExportSpaceDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsString()
  @IsIn(['html', 'markdown', 'lt4docs'])
  format: ExportFormat;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;
}