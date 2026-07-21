import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Firebase Web Project Credentials
const firebaseConfig = {
  apiKey: "AIzaSyAAAK_ceg0uIqucZW07rMY1jhHj4eQY6oY",
  authDomain: "livelocationmit.firebaseapp.com",
  projectId: "livelocationmit",
  storageBucket: "livelocationmit.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

const signInAnonymously = (authInstance) => authInstance.signInAnonymously();

export { firebase, auth, db, signInAnonymously };
