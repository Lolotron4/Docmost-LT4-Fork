// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AssignmentService } from './assignment.service';
import {
  AssignmentIdDto,
  CreateAssignmentDto,
  ListAssignmentsDto,
  PageIdDto,
  SubmissionActionDto,
  SubmissionIdDto,
  UpdateAssignmentDto,
} from './assignment.dto';

@UseGuards(JwtAuthGuard)
@Controller('assignments')
export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}

  @HttpCode(HttpStatus.OK)
  @Post('options')
  options(@AuthUser() user: User) {
    return this.service.options(user);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  list(@Body() dto: ListAssignmentsDto, @AuthUser() user: User) {
    return this.service.list(user, dto.scope);
  }

  @HttpCode(HttpStatus.OK)
  @Post('todo')
  todo(@AuthUser() user: User) {
    return this.service.todo(user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreateAssignmentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.create(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@Body() dto: AssignmentIdDto, @AuthUser() user: User) {
    return this.service.info(dto.assignmentId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(@Body() dto: UpdateAssignmentDto, @AuthUser() user: User) {
    return this.service.update(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  remove(@Body() dto: AssignmentIdDto, @AuthUser() user: User) {
    return this.service.remove(dto.assignmentId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('page-info')
  pageInfo(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.pageInfo(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('submit')
  submit(@Body() dto: SubmissionIdDto, @AuthUser() user: User) {
    return this.service.submit(dto.submissionId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unlock')
  unlock(@Body() dto: SubmissionActionDto, @AuthUser() user: User) {
    return this.service.unlock(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('extend')
  extend(@Body() dto: SubmissionActionDto, @AuthUser() user: User) {
    return this.service.extend(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('lock')
  lock(@Body() dto: SubmissionActionDto, @AuthUser() user: User) {
    return this.service.lockNow(dto, user);
  }
}
