/**
 * ==============================================================================
 * CodeMentor - Registration Controller (register.js)
 * ==============================================================================
 * 
 * Handles:
 * 1. Live password requirements checklist (8+ chars, uppercase, number, symbol)
 * 2. Live password strength indicator (Weak, Fair, Good, Strong)
 * 3. Live password confirmation matching
 * 4. Enabling the "Create Account" button only when all criteria are met
 * 5. Firebase Authentication user creation (createUserWithEmailAndPassword)
 * 6. Saving user profile to Cloud Firestore (users/{uid})
 * ==============================================================================
 */

import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { 
  getFriendlyErrorMessage, 
  setupPasswordToggle, 
  redirectIfLoggedIn, 
  showConfigNoticeIfNeeded 
} from "./auth.js";

// DOM Elements
const registerForm = document.getElementById("registerForm");
const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPasswordBtn");
const registerBtn = document.getElementById("registerBtn");

const alertContainer = document.getElementById("alertContainer");
const matchStatus = document.getElementById("matchStatus");
const strengthMeter = document.getElementById("strengthMeter");
const strengthLabel = document.getElementById("strengthLabel");
const authCard = document.getElementById("authCard");

// Password checklist DOM items
const reqLength = document.getElementById("req-length");
const reqUpper = document.getElementById("req-upper");
const reqNumber = document.getElementById("req-number");
const reqSpecial = document.getElementById("req-special");

// Error helper spans
const fullNameError = document.getElementById("fullNameError");
const usernameError = document.getElementById("usernameError");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");

// Redirect if user is already logged in
redirectIfLoggedIn();

// Show banner if Firebase credentials are placeholders
showConfigNoticeIfNeeded(authCard);

// Setup password visibility eye toggles
setupPasswordToggle(passwordInput, togglePasswordBtn);
setupPasswordToggle(confirmPasswordInput, toggleConfirmPasswordBtn);

/**
 * Checks email address format.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Updates a checklist bullet's class and checkmark icon.
 */
function updateReqItem(element, isSatisfied) {
  const icon = element.querySelector(".req-icon");
  if (isSatisfied) {
    element.className = "req-item valid";
    icon.textContent = "✓";
  } else {
    element.className = "req-item invalid";
    icon.textContent = "✗";
  }
}

/**
 * Checks all 4 password requirements and updates the checklist live.
 */
function checkPasswordRequirements(password) {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  updateReqItem(reqLength, hasLength);
  updateReqItem(reqUpper, hasUpper);
  updateReqItem(reqNumber, hasNumber);
  updateReqItem(reqSpecial, hasSpecial);

  return {
    hasLength,
    hasUpper,
    hasNumber,
    hasSpecial,
    allMet: hasLength && hasUpper && hasNumber && hasSpecial
  };
}

/**
 * Updates the 4-bar password strength meter and text label.
 */
function updatePasswordStrength(password, requirements) {
  strengthMeter.className = "strength-meter-container";

  if (!password) {
    strengthLabel.textContent = "None";
    return;
  }

  const score = [
    requirements.hasLength,
    requirements.hasUpper,
    requirements.hasNumber,
    requirements.hasSpecial
  ].filter(Boolean).length;

  const strengthLevels = ["strength-weak", "strength-weak", "strength-fair", "strength-good", "strength-strong"];
  const strengthLabels = ["Weak", "Weak", "Fair", "Good", "Strong"];

  strengthMeter.classList.add(strengthLevels[score]);
  strengthLabel.textContent = strengthLabels[score];
}

/**
 * Validates whether the confirmation password matches the primary password.
 */
function checkPasswordMatch() {
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!confirmPassword) {
    matchStatus.textContent = "";
    matchStatus.className = "match-status";
    return false;
  }

  if (password === confirmPassword) {
    matchStatus.textContent = "✓ Passwords match";
    matchStatus.className = "match-status valid";
    return true;
  } else {
    matchStatus.textContent = "✗ Passwords do not match";
    matchStatus.className = "match-status invalid";
    return false;
  }
}

/**
 * Validates all registration inputs and enables/disables the submit button.
 */
function validateRegistrationForm() {
  const fullName = fullNameInput.value.trim();
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  const reqs = checkPasswordRequirements(password);
  updatePasswordStrength(password, reqs);
  const passwordsMatch = checkPasswordMatch();

  const isFormValid = 
    fullName.length >= 2 &&
    username.length >= 3 &&
    isValidEmail(email) &&
    reqs.allMet &&
    passwordsMatch &&
    confirmPassword.length > 0;

  registerBtn.disabled = !isFormValid;
  return isFormValid;
}

// Live input listeners for real-time validation
[fullNameInput, usernameInput, emailInput, passwordInput, confirmPasswordInput].forEach((input) => {
  input.addEventListener("input", validateRegistrationForm);
});

// Inline helper blur validations
fullNameInput.addEventListener("blur", () => {
  const val = fullNameInput.value.trim();
  fullNameError.textContent = (val.length > 0 && val.length < 2) ? "Please enter your full name." : "";
  fullNameError.className = fullNameError.textContent ? "form-helper error" : "form-helper";
});

usernameInput.addEventListener("blur", () => {
  const val = usernameInput.value.trim();
  usernameError.textContent = (val.length > 0 && val.length < 3) ? "Username must be at least 3 characters." : "";
  usernameError.className = usernameError.textContent ? "form-helper error" : "form-helper";
});

emailInput.addEventListener("blur", () => {
  const val = emailInput.value.trim();
  emailError.textContent = (val.length > 0 && !isValidEmail(val)) ? "Please enter a valid email address." : "";
  emailError.className = emailError.textContent ? "form-helper error" : "form-helper";
});

confirmPasswordInput.addEventListener("blur", () => {
  const isMatch = passwordInput.value === confirmPasswordInput.value;
  confirmPasswordError.textContent = (confirmPasswordInput.value && !isMatch) ? "Passwords do not match." : "";
  confirmPasswordError.className = confirmPasswordError.textContent ? "form-helper error" : "form-helper";
});

/**
 * Displays error alert banner in the card.
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
 * WORKFLOW 1: User Registration
 * Creates the user in Firebase Auth and saves user profile to Cloud Firestore.
 */
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  alertContainer.innerHTML = "";

  if (!validateRegistrationForm()) return;

  const fullName = fullNameInput.value.trim();
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    registerBtn.disabled = true;
    registerBtn.textContent = "Creating Account...";

    // 1. Create account in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Set display name on Firebase Auth profile
    try {
      await updateProfile(user, { displayName: fullName });
    } catch (profileErr) {
      console.warn("Notice: could not update displayName:", profileErr.message);
    }

    // 3. Store user metadata in Cloud Firestore (Password is NEVER stored)
    try {
      await setDoc(doc(db, "users", user.uid), {
        fullName: fullName,
        username: username,
        email: email,
        createdAt: serverTimestamp()
      });
    } catch (firestoreErr) {
      console.warn("Notice: Firestore profile write skipped:", firestoreErr.message);
    }

    // 4. Redirect to protected dashboard
    window.location.href = "dashboard.html";

  } catch (error) {
    console.error("Registration error:", error);
    showErrorAlert(getFriendlyErrorMessage(error));
    registerBtn.disabled = false;
    registerBtn.textContent = "Create Account";
  }
});
