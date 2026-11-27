// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { NoUrls } from '../../common/validators/no-urls.validator';
import { USERNAME_PATTERN } from './username';

export class CreateJoinCodeDto {
  // Eingebaute Rolle oder UUID einer eigenen Rolle (Prüfung im Service)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  role: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  /** Gruppen, in die neue Konten automatisch aufgenommen werden. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class UpdateJoinCodeGroupsDto {
  @IsUUID()
  id: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds: string[];
}

export class JoinCodeIdDto {
  @IsUUID()
  id: string;
}

export class JoinCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  code: string;
}

export class JoinRegisterDto extends JoinCodeDto {
  @IsIn(['email', 'username'])
  method: 'email' | 'username';

  @MinLength(1)
  @MaxLength(50)
  @IsString()
  @NoUrls()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @ValidateIf((o) => o.method === 'email')
  @IsEmail()
  email?: string;

  @ValidateIf((o) => o.method === 'username')
  @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
  @Matches(USERNAME_PATTERN, {
    message:
      'Username must be 3-32 characters: letters, digits, dot, dash or underscore',
  })
  username?: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(70)
  @IsString()
  password: string;
}

export class SetMemberPasswordDto {
  @IsUUID()
  userId: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(70)
  @IsString()
  password: string;
}
