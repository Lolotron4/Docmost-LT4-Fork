import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { loginIdentifierToEmail } from '../../../lt4/accounts/username';

export class LoginDto {
  // LT4-Fork: E-Mail oder Benutzername (Konten aus Beitrittslinks).
  @IsNotEmpty()
  @IsString()
  @MaxLength(320)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? loginIdentifierToEmail(value) : value,
  )
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
