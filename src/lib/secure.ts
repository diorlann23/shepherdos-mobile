import * as SecureStore from 'expo-secure-store';
import { DEFAULT_SERVER } from '@/constants';

/** The session token and server address live in the phone's keychain / keystore, never in plain storage. */
const TOKEN = 'shepherdos.session';
const SERVER = 'shepherdos.server';

let token: string | null = null;
let server = DEFAULT_SERVER;

export async function loadSecure() {
  token = await SecureStore.getItemAsync(TOKEN);
  server = (await SecureStore.getItemAsync(SERVER)) ?? DEFAULT_SERVER;
}

export const getToken = () => token;
export const getServer = () => server;

export async function setToken(value: string | null) {
  token = value || null;
  if (token) await SecureStore.setItemAsync(TOKEN, token);
  else await SecureStore.deleteItemAsync(TOKEN);
}

export async function setServer(value: string) {
  server = normalizeServer(value);
  await SecureStore.setItemAsync(SERVER, server);
}

export function normalizeServer(value: string) {
  let v = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v;
}
