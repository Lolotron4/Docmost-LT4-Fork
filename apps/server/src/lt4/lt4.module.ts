// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module } from '@nestjs/common';
import { PagePermissionController } from './page-permission/page-permission.controller';
import { PagePermissionService } from './page-permission/page-permission.service';

@Module({
  controllers: [PagePermissionController],
  providers: [PagePermissionService],
})
export class Lt4Module {}
