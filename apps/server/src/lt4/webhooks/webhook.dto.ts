// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { WEBHOOK_EVENTS, WEBHOOK_LANGUAGES, WEBHOOK_TYPES } from './webhook-events';

export class WebhookIdDto {
  @IsUUID()
  webhookId: string;
}

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn(WEBHOOK_TYPES as unknown as string[])
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url: string;

  /** null oder leer = alle Bereiche */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  spaceIds?: string[] | null;

  @IsArray()
  @ArrayMaxSize(50)
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  events: string[];

  @IsOptional()
  @IsIn(WEBHOOK_LANGUAGES as unknown as string[])
  language?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateWebhookDto {
  @IsUUID()
  webhookId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  /** Leer lassen = URL bleibt unverändert */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  spaceIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  events?: string[];

  @IsOptional()
  @IsIn(WEBHOOK_LANGUAGES as unknown as string[])
  language?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Neues Signatur-Geheimnis erzeugen (nur 'generic') */
  @IsOptional()
  @IsBoolean()
  regenerateSecret?: boolean;
}
