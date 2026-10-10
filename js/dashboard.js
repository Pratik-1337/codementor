/**
 * ==============================================================================
 * CodeMentor - Dashboard Controller (dashboard.js)
 * ==============================================================================
 * 
 * Handles:
 * - Protecting the dashboard: verifies Firebase Authentication state on load
 * - Redirecting unauthenticated visitors to login.html
 * - Fetching authenticated user profile data from Cloud Firestore (users/{uid})
 * - Populating the UI dynamically with the user's name/username
 * - Handling sign out (logout) with Firebase signOut()
 * ==============================================================================
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { logoutUser } from "./auth.js";

// DOM Elements
const loadingScreen = document.getElementById("loadingScreen");
const dashboardContent = document.getElementById("dashboardContent");
const welcomeGreeting = document.getElementById("welcomeGreeting");
const navUserName = document.getElementById("navUserName");
const navUserEmail = document.getElementById("navUserEmail");
const userAvatar = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");

// Hook up logout button
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    logoutUser();
  });
}

/**
 * Checks Firebase authentication state on page load.
 * This ensures the dashboard is strictly protected.
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // No active session found -> redirect immediately to login
    console.log("No authenticated user detected. Redirecting to login.html...");
    window.location.replace("login.html");
    return;
  }

  // Active user session verified
  console.log("Authenticated as:", user.email, "UID:", user.uid);

  let displayName = user.displayName || user.email.split("@")[0];
  let email = user.email || "";

  // Attempt to fetch custom profile attributes (username, fullName) from Firestore
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      // Prefer username if available, else fullName
      if (data.username) {
        displayName = data.username;
      } else if (data.fullName) {
        displayName = data.fullName;
      }
      if (data.email) {
        email = data.email;
      }
    }
  } catch (firestoreError) {
    console.warn("Notice: Firestore profile fetch skipped or unavailable:", firestoreError);
  }

  // Update UI with authenticated user data
  welcomeGreeting.textContent = `Welcome, ${displayName}`;
  navUserName.textContent = displayName;
  navUserEmail.textContent = email;
  userAvatar.textContent = displayName.charAt(0).toUpperCase();

  // Reveal protected dashboard and hide loading spinner
  loadingScreen.style.display = "none";
  dashboardContent.style.display = "block";
});
