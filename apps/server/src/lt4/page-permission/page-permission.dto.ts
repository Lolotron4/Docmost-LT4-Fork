// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PagePermissionRole } from '../../common/helpers/types/permission';

export class PagePermissionPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class AddPagePermissionsDto extends PagePermissionPageDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;
}

export class PagePermissionTargetDto extends PagePermissionPageDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class UpdatePagePermissionRoleDto extends PagePermissionTargetDto {
  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;
}
