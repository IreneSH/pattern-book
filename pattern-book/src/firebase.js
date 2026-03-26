import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAg5WDlI8ppvrpD9rHZmavsAW_tfZ46FDE",
  authDomain: "pattern-study-archive-97fbd.firebaseapp.com",
  projectId: "pattern-study-archive-97fbd",
  storageBucket: "pattern-study-archive-97fbd.firebasestorage.app",
  messagingSenderId: "107671750965",
  appId: "1:107671750965:web:80b9ce167a47e57893647c",
  measurementId: "G-Q82HSFQ860"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
