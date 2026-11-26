import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateWorkspaceUserRoleDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  // LT4-Fork: eingebaute Rolle oder UUID einer eigenen Rolle
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  role: string;
}
