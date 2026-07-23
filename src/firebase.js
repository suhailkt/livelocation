import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  signInAnonymously as firebaseSignInAnonymously
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase Web Project Credentials
const firebaseConfig = {
  apiKey: "AIzaSyAAAK_ceg0uIqucZW07rMY1jhHj4eQY6oY",
  authDomain: "livelocationmit.firebaseapp.com",
  projectId: "livelocationmit",
  storageBucket: "livelocationmit.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let authInstance = null;
function getFirebaseAuth() {
  if (!authInstance) {
    try {
      authInstance = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
    } catch (e) {
      authInstance = getAuth(app);
    }
  }
  return authInstance;
}

const db = getFirestore(app);

const signInAnonymously = async () => {
  try {
    const authObj = getFirebaseAuth();
    return await firebaseSignInAnonymously(authObj);
  } catch (e) {
    console.log('Firebase signInAnonymously fallback mode:', e?.message);
    // Return fallback synthetic user so app functionality never blocks the user
    return { user: { uid: 'anon_device_' + Math.random().toString(36).substring(2, 9) } };
  }
};

export { app, getFirebaseAuth, db, signInAnonymously };
