import { getServer, getToken, setToken } from './secure';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { appUserAgent } from './user-agent';

/** An answer from the server that wasn't a success: wrong password, no permission, locked church... */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
/** The server couldn't be reached at all: no signal, airplane mode, server down. */
export class OfflineError extends Error {
  constructor() {
    super('You’re offline. Changes are saved on this phone and will sync when you’re back online.');
  }
}

type Listener = (error: ApiError) => void;
const listeners = new Set<Listener>();
/** Sign-out and lock screens react to these wherever the request came from. */
export function onAuthProblem(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const TIMEOUT_MS = 20_000;

/** Names the app and phone to the server (see user-agent.ts). */
export const USER_AGENT = appUserAgent(Constants.expoConfig?.version ?? '0', { os: Platform.OS, version: Platform.Version, constants: Platform.constants as Record<string, unknown> | undefined });

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', 'x-shepherdos-client': 'mobile', 'user-agent': USER_AGENT, ...init.headers };
  const token = getToken();
  if (token) headers.authorization = `Session ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  init.signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(`${getServer()}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // The session travels in the header only; a cookie would be refused by the server's CSRF check.
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }

  // Sign-in, two-factor and switching church hand back a new session.
  const issued = res.headers.get('x-session-token');
  if (issued !== null) await setToken(issued);

  const text = await res.text();
  let json: { data?: T; meta?: unknown; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // An HTML error page from a proxy or captive portal (hotel / church Wi-Fi sign-in).
    if (!res.ok) throw new OfflineError();
  }
  if (!res.ok) {
    const error = new ApiError(res.status, json.error?.code ?? 'ERROR', json.error?.message ?? 'Something went wrong. Please try again.', json.error?.details);
    if (res.status === 401 || res.status === 402 || ['ORG_SUSPENDED', 'ORG_REJECTED', 'ORG_PENDING', 'MFA_ENROLLMENT_REQUIRED'].includes(error.code)) {
      listeners.forEach((l) => l(error));
    }
    throw error;
  }
  return json.data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
