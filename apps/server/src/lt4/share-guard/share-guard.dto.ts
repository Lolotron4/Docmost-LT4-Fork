// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ShareGuardIdDto {
  @IsString()
  @IsNotEmpty()
  shareId: string;
}

export class ShareGuardUnlockDto extends ShareGuardIdDto {
  @IsString()
  @MaxLength(200)
  password: string;
}

export class ShareGuardUpdateDto extends ShareGuardIdDto {
  /** ISO-Datum; null = kein Ablauf; weglassen = unverändert */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  expiresAt?: string | null;

  /** neues Passwort; '' oder null = Passwort entfernen; weglassen = unverändert */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  password?: string | null;
}

export class ShareLinkPolicyDto {
  @IsBoolean()
  requireExpiry: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(3650)
  maxDays: number | null;

  @IsBoolean()
  requirePassword: boolean;
}
