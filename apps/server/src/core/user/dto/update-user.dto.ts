import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CreateUserDto } from '../../auth/dto/create-user.dto';
import { LT4_THEME_IDS } from '../../../lt4/theme/lt4-theme-ids';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @IsOptional()
  @IsBoolean()
  fullPageWidth: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['read', 'edit'])
  pageEditMode: string;

  @IsOptional()
  @IsBoolean()
  editorToolbar: boolean;

  // LT4: Farb-Theme der App und eigene Akzentfarbe ("" = Farbe des Themes)
  @IsOptional()
  @IsString()
  @IsIn(LT4_THEME_IDS)
  lt4Theme: string;

  @IsOptional()
  @IsString()
  @Matches(/^(#[0-9a-fA-F]{6})?$/)
  lt4Accent: string;

  @IsOptional()
  @IsString()
  locale: string;

  @IsOptional()
  @IsTimeZone()
  timezone: string;

  @IsOptional()
  @MinLength(8)
  @MaxLength(70)
  @IsString()
  confirmPassword: string;

  @IsOptional()
  @IsBoolean()
  notificationPageUpdates: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPageUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentCreated: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentResolved: boolean;
}
