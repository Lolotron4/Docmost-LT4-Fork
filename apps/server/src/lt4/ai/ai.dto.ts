// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsUUID,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AI_ACTIONS, AI_PROVIDERS, AiAction, AiProvider, MAX_INPUT_CHARS, MAX_PROMPT_CHARS } from './ai.util';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(AI_PROVIDERS)
  provider?: AiProvider;

  /** Modell pro Anbieter; leerer Text = Standardmodell. */
  @IsOptional()
  @IsObject()
  models?: Partial<Record<AiProvider, string>>;

  /** Neuer Schlüssel pro Anbieter; leerer Text = Schlüssel entfernen; fehlt = unverändert. */
  @IsOptional()
  @IsObject()
  apiKeys?: Partial<Record<AiProvider, string>>;

  /** 'all' = alle Mitglieder, 'restricted' = nur Admins sowie freigegebene Gruppen und Personen. */
  @IsOptional()
  @IsIn(['all', 'restricted'])
  access?: 'all' | 'restricted';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  allowedGroupIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  allowedUserIds?: string[];
}

export class AiProviderDto {
  @IsIn(AI_PROVIDERS)
  provider: AiProvider;
}

export class AiGenerateDto {
  @IsIn(AI_ACTIONS)
  action: AiAction;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_INPUT_CHARS * 2)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROMPT_CHARS)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  language?: string;
}
