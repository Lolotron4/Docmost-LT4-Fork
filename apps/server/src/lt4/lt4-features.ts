// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Feature } from '../common/features';

/**
 * Features, die der LT4-Fork selbst implementiert. Nur diese meldet der Server
 * an den Client als verfügbar; alles andere bleibt ausgegraut, bis es gebaut ist.
 */
export const LT4_FEATURES: ReadonlySet<string> = new Set<string>([
  Feature.PAGE_PERMISSIONS,
]);

export const LT4_TIER = 'lt4';
