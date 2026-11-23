/**
 * Centralized Brand Configuration for Swiss Tax Platform (Addendum 1 Section 1).
 * Reads build-time env values (populated in next.config.js from backend/app/data/brand_config.json)
 * and supports optional runtime updates via GET /api/v1/config/brand.
 */

export interface BrandConfig {
  name: string;
  shortLeft: string;
  shortRight: string;
  domain: string;
  supportEmail: string;
  noreplyEmail: string;
  logoPath: string;
  primaryColor: string;
  companyLegalName: string;
  filePrefix: string;
}

export const BRAND: BrandConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'SunTax',
  shortLeft: process.env.NEXT_PUBLIC_BRAND_SHORT_LEFT || 'Sun',
  shortRight: process.env.NEXT_PUBLIC_BRAND_SHORT_RIGHT || 'Tax',
  domain: process.env.NEXT_PUBLIC_BRAND_DOMAIN || 'suntax.ch',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'info@suntax.ch',
  noreplyEmail: process.env.NEXT_PUBLIC_NOREPLY_EMAIL || 'noreply@suntax.ch',
  logoPath: process.env.NEXT_PUBLIC_BRAND_LOGO_PATH || '/brand-logo.svg',
  primaryColor: process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR || '#1E7B52',
  companyLegalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME || 'Sun Group KLG',
  filePrefix: (process.env.NEXT_PUBLIC_BRAND_NAME || 'SunTax').replace(/\s+/g, ''),
};

export function interpolateBrandTokens<T>(obj: T, brand: BrandConfig = BRAND): T {
  if (typeof obj === 'string') {
    return obj
      .replace(/\{brandName\}/g, brand.name)
      .replace(/\{supportEmail\}/g, brand.supportEmail)
      .replace(/\{brandDomain\}/g, brand.domain) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateBrandTokens(item, brand)) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = interpolateBrandTokens(v, brand);
    }
    return out as T;
  }
  return obj;
}
