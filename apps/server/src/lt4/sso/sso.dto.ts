// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { SSO_PRESETS, SsoPreset } from './sso.util';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSsoProviderDto {
  @IsIn(SSO_PRESETS)
  preset: SsoPreset;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(trim)
  name: string;

  @ValidateIf((o) => o.preset === 'oidc')
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @Transform(trim)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  tenant?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  clientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  clientSecret: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateSsoProviderDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @Transform(trim)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  tenant?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  clientId?: string;

  /** Leer lassen = bisheriges Geheimnis behalten. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientSecret?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class SsoProviderIdDto {
  @IsUUID()
  id: string;
}
