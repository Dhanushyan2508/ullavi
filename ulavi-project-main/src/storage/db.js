import { openDB } from 'idb';
import { encrypt, decrypt, isEncryptionAvailable } from './crypto';

const DB_NAME = 'cardconnect-db';
const DB_VERSION = 3;

let dbPromise = null;
let useEncryption = false;

export const initDB = async () => {
  useEncryption = isEncryptionAvailable();

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

const encryptData = async (data) => {
  if (!useEncryption) return data;
  try {
    const encrypted = await encrypt(data);
    return { __encrypted: true, data: encrypted };
  } catch {
    return data;
  }
};

const decryptData = async (stored) => {
  if (!useEncryption || !stored || !stored.__encrypted) return stored;
  try {
    return await decrypt(stored.data);
  } catch {
    return null;
  }
};

export const getContactsFromDB = async () => {
  const db = await initDB();
  const raw = await db.getAll('contacts');
  const decrypted = [];
  for (const item of raw) {
    const dec = await decryptData(item);
    if (dec) decrypted.push(dec);
  }
  return decrypted;
};

export const saveContactToDB = async (contact) => {
  const db = await initDB();
  const encrypted = await encryptData(contact);
  return db.put('contacts', encrypted);
};

export const deleteContactFromDB = async (id) => {
  const db = await initDB();
  return db.delete('contacts', id);
};

export const getFoldersFromDB = async () => {
  const db = await initDB();
  const raw = await db.getAll('folders');
  const decrypted = [];
  for (const item of raw) {
    const dec = await decryptData(item);
    if (dec) decrypted.push(dec);
  }
  return decrypted;
};

export const saveFolderToDB = async (folder) => {
  const db = await initDB();
  const encrypted = await encryptData(folder);
  return db.put('folders', encrypted);
};

export const deleteFolderFromDB = async (id) => {
  const db = await initDB();
  return db.delete('folders', id);
};

export const addActionToQueue = async (action) => {
  const db = await initDB();
  const encrypted = await encryptData({ ...action, timestamp: Date.now() });
  return db.add('queue', encrypted);
};

export const getQueue = async () => {
  const db = await initDB();
  const raw = await db.getAll('queue');
  const decrypted = [];
  for (const item of raw) {
    const dec = await decryptData(item);
    if (dec) decrypted.push(dec);
  }
  return decrypted;
};

export const removeActionFromQueue = async (id) => {
  const db = await initDB();
  return db.delete('queue', id);
};

export const updateQueueItem = async (item) => {
  const db = await initDB();
  const encrypted = await encryptData(item);
  return db.put('queue', encrypted);
};

export const clearQueue = async () => {
  const db = await initDB();
  return db.clear('queue');
};
