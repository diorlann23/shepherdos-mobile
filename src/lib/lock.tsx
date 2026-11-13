import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { LOCK_AFTER_MS } from '@/constants';
import { kvGet, kvSet } from './db';

/** Optional Face ID / fingerprint lock: church records stay private if the phone is left unlocked. */
interface LockValue {
  enabled: boolean;
  locked: boolean;
  available: boolean;
  unlock(): Promise<boolean>;
  setEnabled(on: boolean): Promise<boolean>;
}

const LockContext = createContext<LockValue | null>(null);
const KEY = 'biometric-lock';

export function LockProvider({ children, active }: { children: React.ReactNode; active: boolean }) {
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [available, setAvailable] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    (async () => {
      const [hardware, enrolled, saved] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), kvGet<boolean>(KEY)]);
      setAvailable(hardware && enrolled);
      setEnabledState(!!saved);
      if (saved) setLocked(true);
    })();
  }, [active]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundedAt.current = Date.now();
      if (s === 'active' && enabled && backgroundedAt.current && Date.now() - backgroundedAt.current > LOCK_AFTER_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  const unlock = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock ShepherdOS', fallbackLabel: 'Use passcode' });
    if (res.success) setLocked(false);
    return res.success;
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    // Turning it on proves the person can unlock, so they can't lock themselves out.
    if (on) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to turn on the lock' });
      if (!res.success) return false;
    }
    await kvSet(KEY, on);
    setEnabledState(on);
    return true;
  }, []);

  const value = useMemo(() => ({ enabled, locked: enabled && locked, available, unlock, setEnabled }), [enabled, locked, available, unlock, setEnabled]);
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock() {
  const value = useContext(LockContext);
  if (!value) throw new Error('useLock must be used inside LockProvider');
  return value;
}
