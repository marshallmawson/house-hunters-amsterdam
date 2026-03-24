
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCikTuTqPGeHCFqrQJ13t_CJ9GRAm0wLSk",
  authDomain: "house-hunters-amsterdam.firebaseapp.com",
  projectId: "house-hunters-amsterdam",
  storageBucket: "house-hunters-amsterdam.firebasestorage.app",
  messagingSenderId: "315949479081",
  appId: "1:315949479081:web:5951a0ce5f9a4df1ffe5b8",
  measurementId: "G-845EJDBYLP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
const auth = getAuth(app);

export { db, auth };
