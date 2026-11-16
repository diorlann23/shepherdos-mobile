import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, OfflineError, onAuthProblem } from './api';
import { clearChurchData, kvGet, kvSet } from './db';
import { getToken, setServer, setToken } from './secure';
import { resetSyncStatus, setSyncEnabled, syncNow } from './sync';
import { unregisterPush } from './push';
import type { Me } from './types';

/**
 * Where the person is in signing in. The app opens straight into the church
 * from the profile saved on the phone, so it works with no signal; the server
 * is asked again in the background.
 */
export type AuthState = 'loading' | 'signed-out' | 'two-factor' | 'choose-church' | 'closed' | 'ready';

interface AuthValue {
  state: AuthState;
  me: Me | null;
  /** Couldn't reach the server to check the saved sign-in: showing what's on the phone. */
  offline: boolean;
  signIn(input: { email: string; password: string; server: string }): Promise<void>;
  verifyTwoFactor(code: string): Promise<void>;
  chooseChurch(orgId: string): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const ME_KEY = 'me';

function stateFor(me: Me | null): AuthState {
  if (!me) return 'signed-out';
  if (me.session.mfa === 'pending') return 'two-factor';
  if (!me.org) return 'choose-church';
  if (me.org.access !== 'open') return 'closed';
  return 'ready';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<AuthState>('loading');
  const [offline, setOffline] = useState(false);

  const apply = useCallback(async (next: Me | null) => {
    setMe(next);
    setState(stateFor(next));
    if (next) await kvSet(ME_KEY, next);
  }, []);

  const forget = useCallback(async () => {
    await setToken(null);
    await clearChurchData();
    await resetSyncStatus();
    setMe(null);
    setState('signed-out');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<Me>('/auth/me');
      setOffline(false);
      await apply(fresh);
    } catch (e) {
      if (e instanceof OfflineError) setOffline(true);
      else if (e instanceof ApiError && e.status === 401) await forget();
      else throw e;
    }
  }, [apply, forget]);

  // Start-up: the saved profile first, then the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setState('signed-out');
        return;
      }
      const cached = await kvGet<Me>(ME_KEY);
      if (cached && !cancelled) {
        setMe(cached);
        setState(stateFor(cached));
      }
      await refresh().catch(() => undefined);
      if (!cached && !getToken() && !cancelled) setState('signed-out');
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Sync only once fully signed in to an open church (after 2FA, church chosen).
  useEffect(() => {
    setSyncEnabled(state === 'ready');
  }, [state]);

  // Signed out elsewhere, session expired, church locked: follow the server.
  useEffect(
    () =>
      onAuthProblem((error) => {
        // Still waiting for the 2FA code is not signed out: show the code screen.
        if (error.code === 'MFA_REQUIRED') void refresh();
        else if (error.status === 401) void forget();
        else void refresh();
      }),
    [forget, refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      state,
      me,
      offline,
      refresh,
      async signIn({ email, password, server }) {
        await setServer(server);
        await setToken(null);
        await clearChurchData();
        await api<{ mfaRequired: boolean; hasOrganization: boolean }>('/auth/login', { method: 'POST', body: { email, password } });
        // No sync here: with 2FA on, the session can't read church data until the code is entered.
        // The signed-in screens start syncing as soon as they open.
        await refresh();
      },
      async verifyTwoFactor(code) {
        await api('/auth/two-factor', { method: 'POST', body: { code } });
        await refresh();
      },
      async chooseChurch(orgId) {
        await api('/auth/switch-org', { method: 'POST', body: { orgId } });
        // Another church's records must never mix with this one's.
        await clearChurchData();
        await refresh();
        void syncNow();
      },
      async signOut() {
        await unregisterPush();
        await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
        await forget();
      },
    }),
    [state, me, offline, refresh, forget],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
