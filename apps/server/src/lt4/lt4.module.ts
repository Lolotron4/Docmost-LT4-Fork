// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module } from '@nestjs/common';
import { PagePermissionController } from './page-permission/page-permission.controller';
import { PagePermissionService } from './page-permission/page-permission.service';
import { TokenModule } from '../core/auth/token.module';
import { AuthModule } from '../core/auth/auth.module';
import { JoinCodeController } from './accounts/join-code.controller';
import { JoinCodeService } from './accounts/join-code.service';
import { SessionNameController } from './sessions/session-name.controller';
import { SsoController } from './sso/sso.controller';
import { SsoProviderService } from './sso/sso-provider.service';
import { SsoAuthService } from './sso/sso-auth.service';
import { MfaController } from './mfa/mfa.controller';
import { MfaService } from './mfa/mfa.service';
import { BaseController } from './base/base.controller';
import { BaseService } from './base/base.service';
import { PageModule } from '../core/page/page.module';

@Module({
  imports: [TokenModule, AuthModule, PageModule],
  controllers: [PagePermissionController, MfaController, JoinCodeController, SessionNameController, SsoController, BaseController],
  providers: [PagePermissionService, MfaService, JoinCodeService, SsoProviderService, SsoAuthService, BaseService],
  exports: [MfaService],
})
export class Lt4Module {}
