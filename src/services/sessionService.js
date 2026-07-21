import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { PRESET_COLORS, getRandomColor } from '../utils/colorUtils';

export async function getPersistentDeviceId() {
  try {
    let deviceId = await AsyncStorage.getItem('LIVE_LOCATION_DEVICE_ID');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      await AsyncStorage.setItem('LIVE_LOCATION_DEVICE_ID', deviceId);
    }
    return deviceId;
  } catch (e) {
    return 'dev_' + Date.now();
  }
}

function generateSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createSession(creatorId, displayName, customCode = null) {
  const sessionCode = customCode ? customCode.trim().toUpperCase() : generateSessionCode();
  const sessionRef = doc(collection(db, 'sessions'));
  const colorHex = getRandomColor();
  const nowStr = new Date().toISOString();

  const sessionData = {
    sessionCode,
    creatorId,
    active: true,
    participants: {
      [creatorId]: {
        displayName,
        colorHex,
        lastSeen: nowStr
      }
    },
    createdAt: nowStr
  };

  // 10 second timeout guard for Firestore write
  const writePromise = setDoc(sessionRef, sessionData);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Firestore write timed out. Please check Firestore Security Rules in Firebase Console.')), 10000)
  );

  await Promise.race([writePromise, timeoutPromise]);

  return { id: sessionRef.id, ...sessionData };
}

export async function joinSession(sessionCode, deviceId, displayName) {
  const formattedCode = sessionCode.trim().toUpperCase();
  const q = query(
    collection(db, 'sessions'),
    where('sessionCode', '==', formattedCode),
    where('active', '==', true),
    limit(1)
  );

  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    throw new Error('Session code not found or session has ended.');
  }

  const sessionDoc = querySnapshot.docs[0];
  const sessionRef = sessionDoc.ref;
  const nowStr = new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const freshSnap = await transaction.get(sessionRef);
    if (!freshSnap.exists() || !freshSnap.data().active) {
      throw new Error('Session is no longer active.');
    }

    const data = freshSnap.data();
    const participants = data.participants || {};
    const usedColors = new Set(Object.values(participants).map((p) => p.colorHex));
    const existingP = participants[deviceId];
    const colorHex = existingP ? existingP.colorHex : (PRESET_COLORS.find((c) => !usedColors.has(c)) || getRandomColor());

    participants[deviceId] = {
      displayName,
      colorHex,
      lastSeen: nowStr
    };

    transaction.update(sessionRef, { participants });
  });

  const updatedSnap = await getDoc(sessionRef);
  return { id: updatedSnap.id, ...updatedSnap.data() };
}

export async function joinOrCreateFixedSession(deviceId, displayName, fixedCode = 'LIVE12') {
  try {
    return await joinSession(fixedCode, deviceId, displayName);
  } catch (e) {
    // If fixed session doesn't exist yet, create it
    return await createSession(deviceId, displayName, fixedCode);
  }
}

export async function leaveSession(sessionId, deviceId) {
  const sessionRef = doc(db, 'sessions', sessionId);
  const locationRef = doc(db, 'sessions', sessionId, 'locations', deviceId);

  try {
    await deleteDoc(locationRef);
  } catch (e) {}

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sessionRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const participants = { ...(data.participants || {}) };
    delete participants[deviceId];

    if (Object.keys(participants).length === 0) {
      transaction.update(sessionRef, { participants, active: false });
    } else {
      transaction.update(sessionRef, { participants });
    }
  });
}

export async function endSession(sessionId) {
  const sessionRef = doc(db, 'sessions', sessionId);
  await setDoc(sessionRef, { active: false }, { merge: true });
}

export function subscribeSession(sessionId, callback) {
  const sessionRef = doc(db, 'sessions', sessionId);
  return onSnapshot(sessionRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() });
    }
  });
}
