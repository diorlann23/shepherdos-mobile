/**
 * How the app names itself to the server, so the website's list of where
 * you're signed in shows "Samsung SM-S918B · ShepherdOS app 1.0 · Android 14"
 * rather than "Unknown device", and a lost phone can be found and signed out.
 */
export interface PlatformInfo {
  os: string;
  version?: string | number;
  /** React Native's Platform.constants: Android has Manufacturer, Model and Release; iOS has interfaceIdiom. */
  constants?: Record<string, unknown>;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[();\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '');

export function appUserAgent(appVersion: string, p: PlatformInfo): string {
  const product = `ShepherdOS-Mobile/${clean(appVersion) || '0'}`;
  const c = p.constants ?? {};
  if (p.os === 'android') {
    const release = clean(c.Release) || clean(String(p.version ?? ''));
    const model = [clean(c.Manufacturer), clean(c.Model)].filter(Boolean).join(' ');
    return `${product} (Android${release ? ` ${release}` : ''}${model ? `; ${model}` : ''})`;
  }
  if (p.os === 'ios') {
    const idiom = c.interfaceIdiom === 'pad' ? 'iPad' : 'iPhone';
    return `${product} (iOS ${clean(String(p.version ?? ''))}; ${idiom})`;
  }
  return product;
}
