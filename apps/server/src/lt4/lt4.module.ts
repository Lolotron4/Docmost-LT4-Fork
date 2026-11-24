// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module } from '@nestjs/common';
import { PagePermissionController } from './page-permission/page-permission.controller';
import { PagePermissionService } from './page-permission/page-permission.service';
import { TokenModule } from '../core/auth/token.module';
import { MfaController } from './mfa/mfa.controller';
import { MfaService } from './mfa/mfa.service';

@Module({
  imports: [TokenModule],
  controllers: [PagePermissionController, MfaController],
  providers: [PagePermissionService, MfaService],
  exports: [MfaService],
})
export class Lt4Module {}
