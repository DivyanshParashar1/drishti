import Constants from 'expo-constants';

// From app.config.ts `extra` (env at build/start time). APP_TOKEN in the APK is accepted (spec §10).
const extra = (Constants.expoConfig?.extra ?? {}) as { serverUrl?: string; appToken?: string; picovoiceKey?: string };

export const SERVER_URL = (extra.serverUrl ?? 'http://192.168.1.2:8000').replace(/\/$/, '');
export const APP_TOKEN = extra.appToken ?? 'dev-token';
export const authHeaders = () => ({ Authorization: `Bearer ${APP_TOKEN}` });

// P17 wake word: Picovoice AccessKey (PICOVOICE_ACCESS_KEY at build time) and the "Drishti"
// keyword trained in the Picovoice Console, copied from assets/wake/ into the APK's assets.
export const PICOVOICE_KEY = extra.picovoiceKey ?? '';
export const WAKE_KEYWORD_FILE = 'drishti_android.ppn';
