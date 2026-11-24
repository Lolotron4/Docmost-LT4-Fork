// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

const LDAP_URL = /^ldaps?:\/\/[^\s/]+(:\d+)?\/?$/i;

export class LdapProviderFieldsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @Matches(LDAP_URL, { message: 'Server URL must look like ldap://host:389 or ldaps://host:636' })
  @Transform(trim)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  bindDn?: string;

  /** Leer lassen = bisheriges Passwort behalten. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bindPassword?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  baseDn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/\{\{username\}\}/, { message: 'The filter must contain {{username}}' })
  @Transform(trim)
  userSearchFilter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z][A-Za-z0-9-]*$/, { message: 'Invalid attribute name' })
  @Transform(trim)
  usernameAttribute?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z][A-Za-z0-9-]*$/, { message: 'Invalid attribute name' })
  @Transform(trim)
  emailAttribute?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z][A-Za-z0-9-]*$/, { message: 'Invalid attribute name' })
  @Transform(trim)
  nameAttribute?: string;

  /** StartTLS für ldap:// (ldaps:// ist immer verschlüsselt). */
  @IsOptional()
  @IsBoolean()
  startTls?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  caCert?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class CreateLdapProviderDto extends LdapProviderFieldsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(trim)
  declare name: string;

  @Matches(LDAP_URL, { message: 'Server URL must look like ldap://host:389 or ldaps://host:636' })
  @Transform(trim)
  declare url: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(trim)
  declare baseDn: string;
}

export class UpdateLdapProviderDto extends LdapProviderFieldsDto {
  @IsUUID()
  id: string;
}

export class LdapProviderIdDto {
  @IsUUID()
  id: string;
}

export class LdapTestDto extends LdapProviderIdDto {
  /** Optional: prüft zusätzlich, ob dieser Name gefunden wird. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  username?: string;
}

export class LdapLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trim)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  password: string;
}
