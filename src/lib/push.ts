import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { api } from './api';
import { routeForLink } from './push-links';
import { syncNow } from './sync';
import { emit, subscribe } from './events';

/**
 * Push notifications: the same alerts as the bell on the website (an expense
 * waiting for approval, a new task, a first-timer to follow up, a returned
 * report, a counting sheet ready to verify), on the phone's lock screen.
 *
 * The phone registers with the server after sign-in; the server sends only
 * for the church this phone is signed in to, and stops when it signs out.
 */
type Notifications = typeof import('expo-notifications');

export type PushState = 'on' | 'denied' | 'unavailable' | 'not-set-up';

let registered: string | null = null;
let mod: Notifications | null | undefined;
let state: PushState | null = null;

/** What the More screen shows about notifications. */
export const getPushState = () => state;
export const onPushState = (listener: () => void) => subscribe('push', listener);
const settle = (next: PushState) => {
  state = next;
  emit('push');
  return next;
};

/**
 * Expo Go on Android can't receive pushes (it needs the installed ShepherdOS
 * build), and loading the module there only logs an error, so it isn't loaded.
 */
async function notifications(): Promise<Notifications | null> {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web' || (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient)) {
    mod = null;
    return mod;
  }
  mod = await import('expo-notifications');
  // A notification that arrives while the app is open still shows as a banner.
  mod.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  return mod;
}

const projectId = () =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Asks once for permission, then registers this phone with the server. Safe to call on every start. */
export async function registerForPush(): Promise<PushState> {
  return settle(await register());
}

async function register(): Promise<PushState> {
  const N = await notifications();
  if (!N) return 'unavailable';
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'Church notifications',
      importance: N.AndroidImportance.HIGH,
      lightColor: '#0B2A5B',
    });
  }
  let permission = await N.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await N.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  // The app's Expo project id comes from `eas init`; without it there's nowhere to send pushes from.
  const id = projectId();
  if (!id) return 'not-set-up';
  try {
    const { data: token } = await N.getExpoPushTokenAsync({ projectId: id });
    await api('/account/push-devices', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    registered = token;
    return 'on';
  } catch (e) {
    // No connection, or the build has no push credentials yet: try again next time the app opens.
    console.warn('[push] not registered:', e instanceof Error ? e.message : e);
    return 'unavailable';
  }
}

/** Signing out: this phone stops getting the church's notifications. */
export async function unregisterPush() {
  const token = registered;
  registered = null;
  if (!token) return;
  await api('/account/push-devices', { method: 'DELETE', body: { token } }).catch(() => undefined);
}

/** Opens the screen a tapped notification is about, after fetching what's new so the record is on the phone. */
async function open(link: unknown) {
  const target = routeForLink(typeof link === 'string' ? link : null);
  void syncNow();
  router.push(target as never);
}

/** Listens for taps on notifications, including the one that opened the app. Returns a stop function. */
export function handlePushTaps(): () => void {
  let stopped = false;
  let stop: (() => void) | null = null;
  void notifications().then((N) => {
    if (!N || stopped) return;
    const sub = N.addNotificationResponseReceivedListener((response) => {
      void open(response.notification.request.content.data?.link);
    });
    stop = () => sub.remove();
    // The app was closed and a notification opened it.
    const last = N.getLastNotificationResponse();
    if (last) {
      N.clearLastNotificationResponse();
      void open(last.notification.request.content.data?.link);
    }
  });
  return () => {
    stopped = true;
    stop?.();
  };
}
