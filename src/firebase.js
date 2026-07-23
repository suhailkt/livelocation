import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously as firebaseSignInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
    authInstance = getAuth(app);
  }
  return authInstance;
}

const db = getFirestore(app);

const signInAnonymously = async () => {
  try {
    const authObj = getFirebaseAuth();
    return await firebaseSignInAnonymously(authObj);
  } catch (e) {
    console.log('Firebase signInAnonymously error:', e);
    throw e;
  }
};

export { app, getFirebaseAuth, db, signInAnonymously };
