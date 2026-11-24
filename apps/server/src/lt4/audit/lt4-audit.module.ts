// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Global, Module } from '@nestjs/common';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { Lt4AuditService } from './lt4-audit.service';

/** Ersetzt den No-op-Audit-Dienst des Kerns durch eine echte Speicherung. */
@Global()
@Module({
  providers: [Lt4AuditService, { provide: AUDIT_SERVICE, useExisting: Lt4AuditService }],
  exports: [AUDIT_SERVICE, Lt4AuditService],
})
export class Lt4AuditModule {}
