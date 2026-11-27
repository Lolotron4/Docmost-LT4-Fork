// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { HttpException } from '@nestjs/common';

export const SCIM_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const SCIM_ENTERPRISE_USER = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
export const SCIM_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_SPC = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
export const SCIM_RESOURCE_TYPE = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType';
export const SCIM_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Schema';

export const SCIM_CONTENT_TYPE = 'application/scim+json; charset=utf-8';
/** Maximal so viele Einträge pro Seite (count). */
export const SCIM_MAX_PAGE = 200;
/** Präfix der Tokens, damit man sie in Logs/Passwortmanagern erkennt. */
export const SCIM_TOKEN_PREFIX = 'lt4scim_';

export type ScimErrorType =
  | 'invalidFilter'
  | 'tooMany'
  | 'uniqueness'
  | 'mutability'
  | 'invalidSyntax'
  | 'invalidPath'
  | 'noTarget'
  | 'invalidValue';

/** Fehler im SCIM-Format (RFC 7644, Abschnitt 3.12). */
export class ScimError extends HttpException {
  constructor(status: number, detail: string, public readonly scimType?: ScimErrorType) {
    super(detail, status);
  }
}
