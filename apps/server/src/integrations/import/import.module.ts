import { Module } from '@nestjs/common';
import { ImportService } from './services/import.service';
import { ImportController } from './import.controller';
import { StorageModule } from '../storage/storage.module';
import { FileImportTaskService } from './services/file-import-task.service';
import { FileTaskProcessor } from './processors/file-task.processor';
import { ImportAttachmentService } from './services/import-attachment.service';
import { FileTaskController } from './file-task.controller';
import { PageModule } from '../../core/page/page.module';
// LT4: eigener Confluence-Import (lt4/confluence-import)
import { ConfluenceImportService } from '../../lt4/confluence-import/confluence-import.service';
// LT4: Import von .lt4docs-Dateien aus dem LT4-Docs Client
import { Lt4DocsImportService } from '../../lt4/lt4docs-import/lt4docs-import.service';

@Module({
  providers: [
    ImportService,
    FileImportTaskService,
    FileTaskProcessor,
    ImportAttachmentService,
    ConfluenceImportService,
    Lt4DocsImportService,
  ],
  exports: [ImportService, ImportAttachmentService],
  controllers: [ImportController, FileTaskController],
  imports: [StorageModule, PageModule],
})
export class ImportModule {}
