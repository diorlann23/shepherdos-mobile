import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * New versions of the app arrive over the air (EAS Update). The app checks
 * when it opens; this also checks when it comes back to the front, since
 * phones often keep it in the background for days. A downloaded version is
 * used from the next start, or straight away from More → "Restart to update".
 */
const EVERY_MS = 30 * 60_000;

export function watchForUpdates(): () => void {
  if (!Updates.isEnabled || __DEV__) return () => {};
  let last = Date.now();
  let busy = false;
  const check = async () => {
    if (busy || Date.now() - last < EVERY_MS) return;
    busy = true;
    last = Date.now();
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) await Updates.fetchUpdateAsync();
    } catch {
      // No connection or the update service is busy: try again later.
    } finally {
      busy = false;
    }
  };
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void check();
  });
  return () => sub.remove();
}

/** Changes waiting to sync are kept in the phone's database, so restarting loses nothing. */
export const restartToUpdate = () => Updates.reloadAsync();
