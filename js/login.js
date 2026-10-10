/**
 * ==============================================================================
 * CodeMentor - Login Controller (login.js)
 * ==============================================================================
 * 
 * Handles:
 * - Client-side validation of email and password
 * - Password show/hide toggle
 * - Firebase Authentication signInWithEmailAndPassword
 * - Error handling with friendly college-viva friendly explanations
 * - Automatic redirect to dashboard on successful login
 * ==============================================================================
 */

import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { 
  getFriendlyErrorMessage, 
  setupPasswordToggle, 
  redirectIfLoggedIn, 
  showConfigNoticeIfNeeded 
} from "./auth.js";

// DOM Elements
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const loginBtn = document.getElementById("loginBtn");
const alertContainer = document.getElementById("alertContainer");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const authCard = document.getElementById("authCard");

// If user is already authenticated, redirect straight to dashboard
redirectIfLoggedIn();

// If Firebase config is still using placeholder keys, display setup banner
showConfigNoticeIfNeeded(authCard);

// Setup password visibility toggle
setupPasswordToggle(passwordInput, togglePasswordBtn);

/**
 * Validates email format using standard regex
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Displays an error alert box at the top of the card
 * @param {string} message 
 */
function showErrorAlert(message) {
  alertContainer.innerHTML = `
    <div class="alert alert-error">
      <span class="alert-icon">⚠️</span>
      <div>${message}</div>
    </div>
  `;
}

/**
 * Clears existing alert and field errors
 */
function clearErrors() {
  alertContainer.innerHTML = "";
  emailError.textContent = "";
  emailError.className = "form-helper";
  passwordError.textContent = "";
  passwordError.className = "form-helper";
  emailInput.classList.remove("is-invalid");
  passwordInput.classList.remove("is-invalid");
}

// Form Submission Event Listener
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let hasValidationError = false;

  // 1. Validate Email Field
  if (!email) {
    emailError.textContent = "Please enter your email address.";
    emailError.className = "form-helper error";
    emailInput.classList.add("is-invalid");
    hasValidationError = true;
  } else if (!isValidEmail(email)) {
    emailError.textContent = "Please enter a valid email address.";
    emailError.className = "form-helper error";
    emailInput.classList.add("is-invalid");
    hasValidationError = true;
  }

  // 2. Validate Password Field
  if (!password) {
    passwordError.textContent = "Please enter your password.";
    passwordError.className = "form-helper error";
    passwordInput.classList.add("is-invalid");
    hasValidationError = true;
  }

  if (hasValidationError) {
    return;
  }

  // 3. Authenticate with Firebase
  try {
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing In...";

    // Firebase Auth login function
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Logged in successfully:", userCredential.user.email);

    // Redirect to protected dashboard
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Login failure:", error);
    showErrorAlert(getFriendlyErrorMessage(error));
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Log In";
  }
});
