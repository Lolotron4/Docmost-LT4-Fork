// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ListApiKeysDto {
  /** Nur Admins: alle Schlüssel des Workspace. */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(['read', 'write'])
  access?: 'read' | 'write';
}

export class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class ApiKeyIdDto {
  @IsUUID()
  apiKeyId: string;
}
