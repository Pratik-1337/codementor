/**
 * ==============================================================================
 * CodeMentor - Forgot Password Controller (forgot-password.js)
 * ==============================================================================
 * 
 * Handles:
 * - Client-side validation for email field
 * - Triggering Firebase sendPasswordResetEmail
 * - Displaying success confirmation or friendly error messages
 * ==============================================================================
 */

import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { getFriendlyErrorMessage, showConfigNoticeIfNeeded } from "./auth.js";

// DOM Elements
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("email");
const resetBtn = document.getElementById("resetBtn");
const alertContainer = document.getElementById("alertContainer");
const emailError = document.getElementById("emailError");
const authCard = document.getElementById("authCard");

// Show configuration notice if Firebase keys are placeholders
showConfigNoticeIfNeeded(authCard);

/**
 * Validates email format using regex
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Form Submission
forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  alertContainer.innerHTML = "";
  emailError.textContent = "";
  emailError.className = "form-helper";
  emailInput.classList.remove("is-invalid");

  const email = emailInput.value.trim();

  // Validate Email
  if (!email) {
    emailError.textContent = "Please enter your email address.";
    emailError.className = "form-helper error";
    emailInput.classList.add("is-invalid");
    return;
  }

  if (!isValidEmail(email)) {
    emailError.textContent = "Please enter a valid email address.";
    emailError.className = "form-helper error";
    emailInput.classList.add("is-invalid");
    return;
  }

  try {
    resetBtn.disabled = true;
    resetBtn.textContent = "Sending Email...";

    // Firebase Auth password reset
    await sendPasswordResetEmail(auth, email);

    // Show success message
    alertContainer.innerHTML = `
      <div class="alert alert-success">
        <span class="alert-icon">✓</span>
        <div>Password reset email sent. Check your inbox.</div>
      </div>
    `;

    // Clear input
    emailInput.value = "";

  } catch (error) {
    console.error("Password reset error:", error);
    
    // Provide user-friendly error message
    let message = "Unable to send the reset email. Please check your email address.";
    if (error.code === "auth/user-not-found") {
      message = "No account found with this email address.";
    } else if (error.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    } else {
      message = getFriendlyErrorMessage(error);
    }

    alertContainer.innerHTML = `
      <div class="alert alert-error">
        <span class="alert-icon">⚠️</span>
        <div>${message}</div>
      </div>
    `;
  } finally {
    resetBtn.disabled = false;
    resetBtn.textContent = "Send Reset Link";
  }
});
