/**
 * ==============================================================================
 * CodeMentor - Authentication Utilities & Shared Helpers (auth.js)
 * ==============================================================================
 * 
 * Provides reusable functions for:
 * - Translating Firebase error codes into friendly user messages
 * - Show / hide password visibility toggle
 * - Firebase sign out (logout)
 * - Detecting unconfigured Firebase credentials
 * ==============================================================================
 */

import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, isFirebaseConfigured } from "./firebase-config.js";

/**
 * Translates Firebase Authentication error codes to user-friendly messages.
 * Prevents showing confusing technical errors directly to users.
 * 
 * @param {Object|string} error - Firebase error object or error code
 * @returns {string} Friendly error description
 */
export function getFriendlyErrorMessage(error) {
  const code = error?.code || (typeof error === "string" ? error : "");

  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/weak-password":
      return "Password is too weak. Please satisfy all requirements.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a few moments and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled in Firebase Console. Please enable it in Authentication settings.";
    default:
      if (!isFirebaseConfigured()) {
        return "Firebase is not configured yet. Please add your credentials in js/firebase-config.js (see README.md).";
      }
      return error?.message || "Something went wrong. Please try again.";
  }
}

/**
 * Toggles a password input between hidden ("password") and visible ("text").
 * Also updates the button's icon and accessible aria-label.
 * 
 * @param {HTMLInputElement} inputEl - The password input field
 * @param {HTMLButtonElement} btnEl - The toggle button
 */
export function setupPasswordToggle(inputEl, btnEl) {
  if (!inputEl || !btnEl) return;

  btnEl.addEventListener("click", () => {
    const isPassword = inputEl.type === "password";
    inputEl.type = isPassword ? "text" : "password";
    
    // Update button text / icon
    btnEl.textContent = isPassword ? "🙈" : "👁️";
    btnEl.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  });
}

/**
 * Logs out the current user and redirects to login.html
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error("Sign out error:", error);
    alert("Error logging out. Please try again.");
  }
}

/**
 * Checks if the user is already authenticated.
 * If yes, redirects them to the dashboard automatically.
 * Used on login.html and register.html.
 */
export function redirectIfLoggedIn(destination = "dashboard.html") {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.replace(destination);
    }
  });
}

/**
 * Displays a friendly notification banner if Firebase has placeholder credentials.
 * Helps college evaluators / students know when Firebase needs configuration.
 * 
 * @param {HTMLElement} targetContainer - Container element to prepend the notice to
 */
export function showConfigNoticeIfNeeded(targetContainer) {
  if (!isFirebaseConfigured() && targetContainer) {
    const notice = document.createElement("div");
    notice.className = "alert alert-warning";
    notice.innerHTML = `
      <span class="alert-icon">⚠️</span>
      <div>
        <strong>Firebase Setup Needed:</strong> Replace <code>YOUR_API_KEY</code> in 
        <code>js/firebase-config.js</code> with your Firebase project credentials. See 
        <strong>README.md</strong> for quick instructions.
      </div>
    `;
    targetContainer.prepend(notice);
  }
}
