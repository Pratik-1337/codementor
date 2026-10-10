/**
 * ==============================================================================
 * CodeMentor - Dashboard Controller (dashboard.js)
 * ==============================================================================
 * 
 * Handles:
 * 1. Protecting the dashboard: verifies Firebase Authentication state on load
 * 2. Fetching authenticated user profile data from Cloud Firestore (users/{uid})
 * 3. Loading persisted progress (Attempted & Solved) per user UID
 * 4. Rendering LeetCode-style solved progress bar with dynamic denominator
 * 5. Rendering shared problem-list container with 3 preview rows and "View all" toggle
 * 6. Refreshing stats when navigating back from problem workspaces
 * 7. Handling sign out (logout) with Firebase signOut()
 * ==============================================================================
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { logoutUser } from "./auth.js";
import { PROBLEMS } from "./problems-data.js";
import { getUserProgress } from "./progress.js";

// DOM Elements: Authentication & Navigation
const loadingScreen = document.getElementById("loadingScreen");
const dashboardContent = document.getElementById("dashboardContent");
const welcomeGreeting = document.getElementById("welcomeGreeting");
const navUserName = document.getElementById("navUserName");
const navUserEmail = document.getElementById("navUserEmail");
const userAvatar = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");

// DOM Elements: Statistics & Progress Bar
const attemptedCountEl = document.getElementById("attemptedCount");
const solvedCountEl = document.getElementById("solvedCount");
const progressRatioText = document.getElementById("progressRatioText");
const progressPercentText = document.getElementById("progressPercentText");
const progressBarFill = document.getElementById("progressBarFill");
const progressBarTrack = document.getElementById("progressBarTrack");

// DOM Elements: Problem List & Controls
const problemsContainer = document.getElementById("problemsContainer");
const viewAllBtn = document.getElementById("viewAllBtn");

// Active session state
let currentAuthUid = null;
let isListExpanded = false;

// Hook up logout button
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    logoutUser();
  });
}

/**
 * Returns the CSS badge class for a problem difficulty
 */
function getDifficultyBadgeClass(difficulty) {
  switch (difficulty) {
    case "Easy":
      return "db-badge-easy";
    case "Medium":
      return "db-badge-medium";
    case "Hard":
      return "db-badge-hard";
    default:
      return "db-badge-easy";
  }
}

/**
 * Renders problem rows inside the single shared container.
 * Shows first 3 problems by default, or all problems when expanded.
 */
function renderProblemList() {
  if (!problemsContainer) return;

  const totalProblems = PROBLEMS.length;
  const problemsToShow = isListExpanded ? PROBLEMS : PROBLEMS.slice(0, 3);

  // Generate compact rows separated by thin horizontal dividers
  problemsContainer.innerHTML = problemsToShow
    .map((p) => {
      const badgeClass = getDifficultyBadgeClass(p.difficulty);
      return `
        <a href="problem.html?id=${p.id}" class="db-problem-row" aria-label="Solve Problem ${p.id}: ${p.title}">
          <div class="db-problem-row-left">
            <div class="db-problem-row-title">${p.id}. ${p.title}</div>
            <div class="db-problem-row-topics">${p.topics}</div>
          </div>
          <div class="db-problem-row-right">
            <span class="${badgeClass}">${p.difficulty}</span>
            <span class="db-problem-solve-btn">Solve &rarr;</span>
          </div>
        </a>
      `;
    })
    .join("");

  // Update "View all" control according to problem count
  if (viewAllBtn) {
    if (totalProblems <= 3) {
      viewAllBtn.textContent = "All 3 problems";
      viewAllBtn.disabled = true;
      viewAllBtn.classList.add("db-view-all-disabled");
    } else {
      viewAllBtn.disabled = false;
      viewAllBtn.classList.remove("db-view-all-disabled");
      viewAllBtn.textContent = isListExpanded ? "Show less" : `View all (${totalProblems})`;
    }
  }
}

/**
 * Handles toggling the "View all" / "Show less" state
 */
if (viewAllBtn) {
  viewAllBtn.addEventListener("click", () => {
    if (PROBLEMS.length > 3) {
      isListExpanded = !isListExpanded;
      renderProblemList();
    }
  });
}

/**
 * Loads real persisted progress for the active user and updates statistics + progress bar
 * 
 * @param {string} uid - Firebase Auth UID
 */
async function refreshDashboardMetrics(uid) {
  if (!uid) return;

  try {
    const { attemptedCount, solvedCount } = await getUserProgress(uid);

    // Update 2-column statistics
    if (attemptedCountEl) {
      attemptedCountEl.textContent = attemptedCount;
    }
    if (solvedCountEl) {
      solvedCountEl.textContent = solvedCount;
    }

    // Calculate dynamic progress bar metrics
    const totalProblems = PROBLEMS.length;
    const percent = totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0;

    if (progressRatioText) {
      progressRatioText.textContent = `${solvedCount} / ${totalProblems} solved`;
    }
    if (progressPercentText) {
      progressPercentText.textContent = `${percent}%`;
    }
    if (progressBarFill) {
      progressBarFill.style.width = `${percent}%`;
    }
    if (progressBarTrack) {
      progressBarTrack.setAttribute("aria-valuenow", percent);
    }
  } catch (error) {
    console.warn("Notice: could not refresh dashboard metrics:", error);
  }
}

/**
 * Auto-refresh metrics whenever the dashboard regains focus (e.g. returning from problem tab)
 */
window.addEventListener("focus", () => {
  if (currentAuthUid) {
    refreshDashboardMetrics(currentAuthUid);
  }
});

window.addEventListener("pageshow", () => {
  if (currentAuthUid) {
    refreshDashboardMetrics(currentAuthUid);
  }
});

/**
 * Checks Firebase authentication state on page load.
 * Strictly protects the dashboard and loads user-specific data.
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentAuthUid = null;
    console.log("No authenticated user detected. Redirecting to login.html...");
    window.location.replace("login.html");
    return;
  }

  currentAuthUid = user.uid;
  console.log("Authenticated as:", user.email, "UID:", user.uid);

  let displayName = user.displayName || user.email.split("@")[0];
  let email = user.email || "";

  // Attempt to fetch custom profile attributes (username, fullName) from Firestore
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
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
  if (welcomeGreeting) welcomeGreeting.textContent = `Welcome, ${displayName}`;
  if (navUserName) navUserName.textContent = displayName;
  if (navUserEmail) navUserEmail.textContent = email;
  if (userAvatar) userAvatar.textContent = displayName.charAt(0).toUpperCase();

  // Render problem list from PROBLEMS catalogue
  renderProblemList();

  // Load and populate Attempted, Solved and Progress bar metrics
  await refreshDashboardMetrics(user.uid);

  // Reveal protected dashboard and hide loading spinner
  loadingScreen.style.display = "none";
  dashboardContent.style.display = "block";
});
