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
import { ApiKeyController } from './api-key/api-key.controller';
import { ApiKeyService } from './api-key/api-key.service';
import { DocxExportController } from './docx-export/docx-export.controller';
import { DocxExportService } from './docx-export/docx-export.service';
import { PageAccessModule } from '../core/page/page-access/page-access.module';
import { PersonalSpaceController } from './personal-space/personal-space.controller';
import { PersonalSpaceService } from './personal-space/personal-space.service';
import { PageVerificationController } from './page-verification/page-verification.controller';
import { PageVerificationService } from './page-verification/page-verification.service';
import { PageVerificationSchedulerService } from './page-verification/page-verification-scheduler.service';
import { ReadConfirmationController } from './read-confirmation/read-confirmation.controller';
import { ReadConfirmationService } from './read-confirmation/read-confirmation.service';
import { NotificationModule } from '../core/notification/notification.module';
import { AuditLogController } from './audit/audit-log.controller';
import { SecuritySettingsController } from './security/security-settings.controller';
import { ImportImageStoreService } from './document-import/import-image-store.service';
import { DocxImportService } from './document-import/docx-import.service';
import { PdfImportService } from './document-import/pdf-import.service';
import { AttachmentIndexService } from './attachment-search/attachment-index.service';
import { AttachmentSearchController } from './attachment-search/attachment-search.controller';
import { LdapService } from './ldap/ldap.service';
import { LdapController } from './ldap/ldap.controller';
import { Lt4IntegrationsModule } from './integrations/lt4-integrations.module';
import { Lt4McpModule } from './mcp/mcp.module';

@Module({
  imports: [TokenModule, AuthModule, PageModule, AttachmentModule, SpaceModule, PageAccessModule, NotificationModule, Lt4IntegrationsModule, Lt4McpModule],
  controllers: [PagePermissionController, MfaController, JoinCodeController, SessionNameController, SsoController, BaseController, AiController, TemplateController, PersonalSpaceController, AnnouncementController, ApiKeyController, DocxExportController, PageVerificationController, ReadConfirmationController, AuditLogController, SecuritySettingsController, AttachmentSearchController, LdapController],
  providers: [PagePermissionService, MfaService, JoinCodeService, SsoProviderService, SsoAuthService, BaseService, AiService, TemplateService, TemplateAccessService, PersonalSpaceService, AnnouncementService, ApiKeyService, DocxExportService, PageVerificationService, PageVerificationSchedulerService, ReadConfirmationService, ImportImageStoreService, DocxImportService, PdfImportService, AttachmentIndexService, LdapService],
  exports: [MfaService, TemplateAccessService],
})
export class Lt4Module {}
