import { Injectable } from '@nestjs/common';
import { LT4_FEATURES, LT4_TIER } from '../../lt4/lt4-features';

/**
 * LT4-Fork: Es gibt keine Lizenzprüfung. Verfügbar ist genau das, was der Fork
 * selbst implementiert (siehe lt4/lt4-features.ts). Lizenzschlüssel und
 * Cloud-Pläne werden ignoriert; die Signaturen bleiben für die Aufrufer im Kern.
 */
@Injectable()
export class LicenseCheckService {
  isValidEELicense(_licenseKey?: string): boolean {
    return true;
  }

  hasFeature(_licenseKey: string, feature: string, _plan?: string): boolean {
    return LT4_FEATURES.has(feature);
  }

  getFeatures(_licenseKey?: string): string[] {
    return [...LT4_FEATURES];
  }

  resolveFeatures(_licenseKey: string, _plan: string): string[] {
    return this.getFeatures();
  }

  resolveTier(_licenseKey: string, _plan: string): string {
    return LT4_TIER;
  }
}
