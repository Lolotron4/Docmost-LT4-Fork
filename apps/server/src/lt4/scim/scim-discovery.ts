// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Selbstbeschreibung des SCIM-Dienstes (RFC 7643, Abschnitte 5–7).
import {
  SCIM_ENTERPRISE_USER,
  SCIM_GROUP,
  SCIM_MAX_PAGE,
  SCIM_RESOURCE_TYPE,
  SCIM_SCHEMA,
  SCIM_SPC,
  SCIM_USER,
} from './scim.constants';

export function serviceProviderConfig(baseUrl: string) {
  return {
    schemas: [SCIM_SPC],
    documentationUri: 'https://github.com/Lolotron4/Docmost-LT4-Fork/blob/main/docs/lt4/scim.md',
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: SCIM_MAX_PAGE },
    changePassword: { supported: true },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'Bearer token',
        description: 'Token from Settings > SCIM',
        primary: true,
      },
    ],
    meta: { resourceType: 'ServiceProviderConfig', location: `${baseUrl}/ServiceProviderConfig` },
  };
}

export function resourceTypes(baseUrl: string) {
  return [
    {
      schemas: [SCIM_RESOURCE_TYPE],
      id: 'User',
      name: 'User',
      endpoint: '/Users',
      schema: SCIM_USER,
      schemaExtensions: [{ schema: SCIM_ENTERPRISE_USER, required: false }],
      meta: { resourceType: 'ResourceType', location: `${baseUrl}/ResourceTypes/User` },
    },
    {
      schemas: [SCIM_RESOURCE_TYPE],
      id: 'Group',
      name: 'Group',
      endpoint: '/Groups',
      schema: SCIM_GROUP,
      meta: { resourceType: 'ResourceType', location: `${baseUrl}/ResourceTypes/Group` },
    },
  ];
}

const attr = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  type: 'string',
  multiValued: false,
  required: false,
  caseExact: false,
  mutability: 'readWrite',
  returned: 'default',
  uniqueness: 'none',
  ...extra,
});

export function schemas(baseUrl: string) {
  return [
    {
      schemas: [SCIM_SCHEMA],
      id: SCIM_USER,
      name: 'User',
      description: 'User account',
      attributes: [
        attr('userName', { required: true, uniqueness: 'server' }),
        attr('externalId', { caseExact: true }),
        {
          ...attr('name', { type: 'complex' }),
          subAttributes: [attr('formatted'), attr('givenName'), attr('familyName')],
        },
        attr('displayName'),
        attr('active', { type: 'boolean' }),
        attr('password', { mutability: 'writeOnly', returned: 'never' }),
        {
          ...attr('emails', { type: 'complex', multiValued: true }),
          subAttributes: [attr('value'), attr('type'), attr('primary', { type: 'boolean' })],
        },
        {
          ...attr('groups', { type: 'complex', multiValued: true, mutability: 'readOnly' }),
          subAttributes: [attr('value', { mutability: 'readOnly' }), attr('display', { mutability: 'readOnly' })],
        },
      ],
      meta: { resourceType: 'Schema', location: `${baseUrl}/Schemas/${SCIM_USER}` },
    },
    {
      schemas: [SCIM_SCHEMA],
      id: SCIM_GROUP,
      name: 'Group',
      description: 'Group',
      attributes: [
        attr('displayName', { required: true, uniqueness: 'server' }),
        attr('externalId', { caseExact: true }),
        {
          ...attr('members', { type: 'complex', multiValued: true }),
          subAttributes: [attr('value', { mutability: 'immutable' }), attr('display', { mutability: 'readOnly' })],
        },
      ],
      meta: { resourceType: 'Schema', location: `${baseUrl}/Schemas/${SCIM_GROUP}` },
    },
  ];
}
