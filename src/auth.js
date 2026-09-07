import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const tokenKey = 'seconddeck_session';
const apiOrigin = Capacitor.isNativePlatform() ? 'https://seconddeck.lws-workspace.com' : '';

export async function getToken() {
  return (await Preferences.get({ key: tokenKey })).value;
}

export async function setToken(value) {
  await Preferences.set({ key: tokenKey, value });
}

export async function clearToken() {
  await Preferences.remove({ key: tokenKey });
}

export async function api(path, options = {}) {
  const token = await getToken();
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${apiOrigin}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status, body });
  return body;
}
