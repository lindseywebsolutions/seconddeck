import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const tokenKey = 'seconddeck_session';
const profileKey = 'seconddeck_verified_profile';
const apiOrigin = Capacitor.isNativePlatform() ? 'https://seconddeck.lws-workspace.com' : '';

export async function getToken() {
  return (await Preferences.get({ key: tokenKey })).value;
}

export async function setToken(value) {
  await Preferences.set({ key: tokenKey, value });
}

export async function clearToken() {
  await Preferences.remove({ key: tokenKey });
  await Preferences.remove({ key: profileKey });
}

export async function getCachedProfile() {
  try { return JSON.parse((await Preferences.get({ key: profileKey })).value || 'null'); }
  catch { return null; }
}

export async function setCachedProfile(profile) {
  await Preferences.set({ key: profileKey, value: JSON.stringify({ email: profile.email, aiProvider: profile.aiProvider }) });
}

export async function api(path, options = {}) {
  const token = await getToken();
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 10_000) : null;
  try {
    const response = await fetch(`${apiOrigin}${path}`, { ...options, headers, signal: options.signal || controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status, body });
    return body;
  } finally { if (timeout) clearTimeout(timeout); }
}
