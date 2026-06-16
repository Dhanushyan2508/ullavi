import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';

const COLLECTION_NAME = 'contacts';

const getDb = () => {
  const db = getFirestoreDb();
  if (!db) return null;
  return db;
};

export const saveContactToFirebase = async (contact) => {
  const db = getDb();
  if (!db) return { success: false, error: 'Firebase not configured' };

  try {
    const contactId = contact.id ? String(contact.id) : String(Date.now());
    const sanitized = { ...contact };

    if (sanitized.imageBlob) {
      try {
        const uint8 = new Uint8Array(await sanitized.imageBlob.arrayBuffer());
        const binary = String.fromCharCode(...uint8);
        sanitized.imageBlobBase64 = btoa(binary);
      } catch {
        // skip blob encoding if it fails
      }
      delete sanitized.imageBlob;
    }

    if (sanitized.previewUrl && sanitized.previewUrl.startsWith('blob:')) {
      delete sanitized.previewUrl;
    }

    const docRef = doc(db, COLLECTION_NAME, contactId);
    await setDoc(docRef, {
      ...sanitized,
      firebaseSyncedAt: new Date().toISOString(),
    });

    return { success: true, firebaseId: contactId };
  } catch (error) {
    console.error('Firebase save error:', error);
    return { success: false, error: error.message };
  }
};

export const deleteContactFromFirebase = async (contactId) => {
  const db = getDb();
  if (!db) return { success: false, error: 'Firebase not configured' };

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, String(contactId)));
    return { success: true };
  } catch (error) {
    console.error('Firebase delete error:', error);
    return { success: false, error: error.message };
  }
};

export const getContactFromFirebase = async (contactId) => {
  const db = getDb();
  if (!db) return null;

  try {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, String(contactId)));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.imageBlobBase64) {
        try {
          const binary = atob(data.imageBlobBase64);
          const uint8 = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            uint8[i] = binary.charCodeAt(i);
          }
          data.imageBlob = new Blob([uint8], { type: 'image/jpeg' });
        } catch {
          // skip blob decoding if it fails
        }
        delete data.imageBlobBase64;
      }
      return { id: docSnap.id, ...data };
    }
    return null;
  } catch (error) {
    console.error('Firebase get error:', error);
    return null;
  }
};

export const getAllContactsFromFirebase = async () => {
  const db = getDb();
  if (!db) return [];

  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('firebaseSyncedAt', 'desc'),
      limit(500)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Firebase getAll error:', error);
    return [];
  }
};

export const searchFirebaseContacts = async (searchTerm) => {
  const db = getDb();
  if (!db) return [];

  try {
    const all = await getAllContactsFromFirebase();
    const term = searchTerm.toLowerCase();
    return all.filter(c =>
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.company && c.company.toLowerCase().includes(term)) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term))
    );
  } catch (error) {
    console.error('Firebase search error:', error);
    return [];
  }
};

export const isFirebaseConfigured = () => {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  return !!(apiKey && apiKey !== 'your-api-key');
};
