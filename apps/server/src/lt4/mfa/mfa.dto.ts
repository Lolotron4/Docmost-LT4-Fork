// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class MfaCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;
}

export class MfaResetUserDto {
  @IsUUID()
  userId: string;
}
