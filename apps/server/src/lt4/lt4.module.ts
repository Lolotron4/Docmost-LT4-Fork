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
import { AiController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { TemplateController } from './template/template.controller';
import { TemplateService } from './template/template.service';
import { TemplateAccessService } from './template/template-access.service';
import { AttachmentModule } from '../core/attachment/attachment.module';
import { PageModule } from '../core/page/page.module';
import { SpaceModule } from '../core/space/space.module';
import { AnnouncementController } from './announcement/announcement.controller';
import { AnnouncementService } from './announcement/announcement.service';
import { PersonalSpaceController } from './personal-space/personal-space.controller';
import { PersonalSpaceService } from './personal-space/personal-space.service';

@Module({
  imports: [TokenModule, AuthModule, PageModule, AttachmentModule, SpaceModule],
  controllers: [PagePermissionController, MfaController, JoinCodeController, SessionNameController, SsoController, BaseController, AiController, TemplateController, PersonalSpaceController, AnnouncementController],
  providers: [PagePermissionService, MfaService, JoinCodeService, SsoProviderService, SsoAuthService, BaseService, AiService, TemplateService, TemplateAccessService, PersonalSpaceService, AnnouncementService],
  exports: [MfaService, TemplateAccessService],
})
export class Lt4Module {}
