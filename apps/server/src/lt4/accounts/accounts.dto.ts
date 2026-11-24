// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
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
  @IsIn(['member', 'admin'])
  role: 'member' | 'admin';

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
