// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Feature } from '../common/features';

/**
 * Features, die der LT4-Fork selbst implementiert. Nur diese meldet der Server
 * an den Client als verfügbar; alles andere bleibt ausgegraut, bis es gebaut ist.
 */
export const LT4_FEATURES: ReadonlySet<string> = new Set<string>([
  Feature.PAGE_PERMISSIONS,
  Feature.MFA,
  Feature.SSO_CUSTOM,
  Feature.SSO_GOOGLE,
  Feature.BASES,
  Feature.TEMPLATES,
  Feature.PERSONAL_SPACES,
  Feature.SHARING_CONTROLS,
  Feature.EXPORT_CONTROLS,
  Feature.VIEWER_COMMENTS,
  Feature.ANNOUNCEMENTS,
  Feature.API_KEYS,
  Feature.DOCX_EXPORT,
  Feature.PAGE_VERIFICATION,
  Feature.AUDIT_LOGS,
  Feature.SECURITY_SETTINGS,
  Feature.RETENTION,
  Feature.DOCX_IMPORT,
  Feature.PDF_IMPORT,
  Feature.ATTACHMENT_INDEXING,
  Feature.INTEGRATIONS,
  Feature.MCP,
]);

export const LT4_TIER = 'lt4';
