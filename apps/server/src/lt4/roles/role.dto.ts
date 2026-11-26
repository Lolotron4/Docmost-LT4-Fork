// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class MoveRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key: string;

  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

export class DeleteRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replacementKey?: string;
}

export class SetGroupRoleDto {
  @IsUUID()
  groupId: string;

  // null oder leer = Rolle entfernen
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roleKey?: string | null;
}
