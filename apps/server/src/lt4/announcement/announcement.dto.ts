// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const ANNOUNCEMENT_COLORS = ['blue', 'green', 'yellow', 'red', 'gray'] as const;
export const ANNOUNCEMENT_AUDIENCES = ['members', 'everyone'] as const;

export class AnnouncementIdDto {
  @IsUUID()
  announcementId: string;
}

export class ListAnnouncementsDto {
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_COLORS as unknown as string[])
  color?: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES as unknown as string[])
  audience?: string;

  @IsOptional()
  @IsBoolean()
  isDismissible?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  endsAt?: string | null;
}

export class UpdateAnnouncementDto extends CreateAnnouncementDto {
  @IsUUID()
  announcementId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  declare title: string;
}

export class ArchiveAnnouncementDto extends AnnouncementIdDto {
  @IsBoolean()
  archived: boolean;
}
