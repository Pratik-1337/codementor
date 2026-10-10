/**
 * ==============================================================================
 * CodeMentor - Firebase Configuration & Initialization
 * ==============================================================================
 * 
 * This file connects your CodeMentor web application to Google Firebase.
 * 
 * HOW TO SET UP YOUR FIREBASE CREDENTIALS:
 * 1. Go to the Firebase Console: https://console.firebase.google.com/
 * 2. Create a new Firebase project (e.g., "codementor-practice").
 * 3. In your project dashboard, click the Web icon (</>) to register a web app.
 * 4. Copy the "firebaseConfig" object provided by Firebase.
 * 5. Replace the placeholder values below with your real credentials.
 * ==============================================================================
 */

// Import official Firebase v10 Modular SDK modules from Google's CDN (no npm required)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// YOUR FIREBASE CONFIGURATION OBJECT
// Replace these placeholder strings with your actual Firebase project settings
export const firebaseConfig = {
  apiKey: "AIzaSyBXuPEKd5cGHZqjW6AKRsxswS8FEg5PkCE",
  authDomain: "codementor-a03c4.firebaseapp.com",
  projectId: "codementor-a03c4",
  storageBucket: "codementor-a03c4.firebasestorage.app",
  messagingSenderId: "63057868748",
  appId: "1:63057868748:web:d256abb0ee7f790ffacf69"
};

/**
 * Helper to check if the user has replaced placeholder credentials.
 * Used across the UI to show helpful configuration guidance during development/viva.
 */
export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    Boolean(firebaseConfig.projectId) &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  );
}

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication service
export const auth = getAuth(app);

// Initialize Cloud Firestore database service
export const db = getFirestore(app);
