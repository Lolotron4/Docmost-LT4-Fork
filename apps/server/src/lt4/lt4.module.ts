// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module } from '@nestjs/common';
import { PagePermissionController } from './page-permission/page-permission.controller';
import { PagePermissionService } from './page-permission/page-permission.service';
import { TokenModule } from '../core/auth/token.module';
import { AuthModule } from '../core/auth/auth.module';
import { JoinCodeController } from './accounts/join-code.controller';
import { JoinCodeService } from './accounts/join-code.service';
import { SessionNameController } from './sessions/session-name.controller';
import { MfaController } from './mfa/mfa.controller';
import { MfaService } from './mfa/mfa.service';

@Module({
  imports: [TokenModule, AuthModule],
  controllers: [PagePermissionController, MfaController, JoinCodeController, SessionNameController],
  providers: [PagePermissionService, MfaService, JoinCodeService],
  exports: [MfaService],
})
export class Lt4Module {}
