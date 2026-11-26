// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  parentPageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsDateString()
  dueAt: string;

  @IsOptional()
  @IsBoolean()
  lockAfterDue?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSubmit?: boolean;
}

export class UpdateAssignmentDto {
  @IsUUID()
  assignmentId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  lockAfterDue?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSubmit?: boolean;
}

export class AssignmentIdDto {
  @IsUUID()
  assignmentId: string;
}

export class ListAssignmentsDto {
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';
}

export class PageIdDto {
  @IsUUID()
  pageId: string;
}

export class SubmissionIdDto {
  @IsUUID()
  submissionId: string;
}

export class SubmissionActionDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  submissionIds: string[];

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
