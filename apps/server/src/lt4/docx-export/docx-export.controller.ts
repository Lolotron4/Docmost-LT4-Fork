// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { ApiKeyScope } from '../../common/decorators/api-key-scope.decorator';
import { User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { sanitizeFileName } from '../../common/helpers';
import { DocxExportService } from './docx-export.service';

class DocxExportDto {
  @IsString()
  pageId: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class DocxExportController {
  constructor(
    private readonly docx: DocxExportService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  @ApiKeyScope('read')
  @HttpCode(HttpStatus.OK)
  @Post('docx-export')
  async exportDocx(@Body() dto: DocxExportDto, @AuthUser() user: User, @Res() res: FastifyReply) {
    const page = await this.pageRepo.findById(dto.pageId, { includeContent: true });
    if (!page || page.deletedAt) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanView(page, user);
    await this.pageAccessService.validateCanExport(page.spaceId, page.workspaceId);

    const buffer = await this.docx.exportPage(page);
    const fileName =
      sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) + '.docx';
    res.headers({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fileName) + '"',
    });
    res.send(buffer);
  }
}
