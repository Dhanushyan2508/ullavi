const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const ITERATIONS = 600000;
const KEY_STORE_KEY = 'cardconnect_encryption_key';

let cachedKey = null;

const generateKey = async () => {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
};

const deriveKeyFromPassword = async (password, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
};

const getStorageKey = async () => {
  if (cachedKey) return cachedKey;

  const stored = localStorage.getItem(KEY_STORE_KEY);
  if (stored) {
    try {
      const { wrappedKey, salt } = JSON.parse(stored);
      const deviceKey = await deriveDeviceKey();
      const saltBuf = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
      const unwrapKey = await deriveKeyFromPassword(deviceKey, saltBuf);
      const wrappedBuf = Uint8Array.from(atob(wrappedKey), c => c.charCodeAt(0));
      cachedKey = await crypto.subtle.unwrapKey(
        'raw',
        wrappedBuf,
        unwrapKey,
        { name: ALGORITHM },
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
      );
      return cachedKey;
    } catch {
      localStorage.removeItem(KEY_STORE_KEY);
      return generateAndStoreKey();
    }
  }

  return generateAndStoreKey();
};

const generateAndStoreKey = async () => {
  const key = await generateKey();
  const deviceKey = await deriveDeviceKey();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const wrapKey = await deriveKeyFromPassword(deviceKey, salt);
  const wrappedKey = await crypto.subtle.wrapKey('raw', key, wrapKey, { name: ALGORITHM });
  const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrappedKey)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  localStorage.setItem(KEY_STORE_KEY, JSON.stringify({ wrappedKey: wrappedB64, salt: saltB64 }));
  cachedKey = key;
  return key;
};

const deriveDeviceKey = async () => {
  const parts = [navigator.userAgent, navigator.language, screen.width, screen.height, screen.colorDepth];
  const fingerprint = parts.join('|');
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(fingerprint));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).slice(0, 32);
};

export const encrypt = async (data) => {
  const key = await getStorageKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
};

export const decrypt = async (ciphertext) => {
  try {
    const key = await getStorageKey();
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch {
    return null;
  }
};

export const isEncryptionAvailable = () => {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined;
};

export const resetEncryptionKey = async () => {
  localStorage.removeItem(KEY_STORE_KEY);
  cachedKey = null;
};
