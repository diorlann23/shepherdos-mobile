import Constants from 'expo-constants';

/** The ShepherdOS server the app talks to, unless changed on the sign-in screen. */
export const DEFAULT_SERVER: string = (Constants.expoConfig?.extra?.defaultServer as string | undefined) ?? 'https://shepherdoss.vercel.app';

/** Collections the app keeps on the phone, in the order they are pulled. */
export const SYNC_COLLECTIONS = ['members', 'households'] as const;
export type CollectionName = (typeof SYNC_COLLECTIONS)[number];

/** How often to sync while the app is open and online. */
export const SYNC_INTERVAL_MS = 5 * 60_000;
/** Ask for Face ID / fingerprint again after the app has been in the background this long. */
export const LOCK_AFTER_MS = 60_000;

export const MEMBER_STATUSES: { value: string; label: string }[] = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'new_convert', label: 'New convert' },
  { value: 'member', label: 'Member' },
  { value: 'worker', label: 'Worker' },
  { value: 'leader', label: 'Leader' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'deceased', label: 'Deceased' },
];
export const statusLabel = (v: string) => MEMBER_STATUSES.find((s) => s.value === v)?.label ?? v;
