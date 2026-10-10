/**
 * ==============================================================================
 * CodeMentor - Problem Workspace Controller (workspace.js)
 * ==============================================================================
 * 
 * Coordinates the 3-column C++ learning workspace:
 * 1. Authentication check & user profile header
 * 2. Monaco C++ Editor initialization & state
 * 3. Remote C++ compilation & execution (Run Code via Wandbox)
 * 4. Test case evaluation & verdict banner (Submit Solution)
 * 5. Progressive Hint System (Single-level unlocks: 1 to 5, HARD/NORMAL/EASY)
 * 6. Context-Aware AI Mentor Chat (analyzes live C++ code & terminal output)
 * ==============================================================================
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { logoutUser } from "./auth.js";
import { initCppEditor, getCppCode, resetCppCode, STARTER_CPP_CODE } from "./editor.js";
import { executeCppCode, submitTwoSumSolution } from "./execution.js";
import { sendChatMessage, requestProgressiveHint } from "./ai.js";

// DOM Elements: Navigation & Auth
const loadingScreen = document.getElementById("loadingScreen");
const problemWorkspace = document.getElementById("problemWorkspace");
const navUserName = document.getElementById("navUserName");
const navUserEmail = document.getElementById("navUserEmail");
const userAvatar = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");

// DOM Elements: Editor Toolbar & Controls
const hintModeSelect = document.getElementById("hintModeSelect");
const runCodeBtn = document.getElementById("runCodeBtn");
const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");
const getHintBtn = document.getElementById("getHintBtn");

// DOM Elements: Custom Input & Terminal
const customStdinInput = document.getElementById("customStdinInput");
const terminalConsole = document.getElementById("terminalConsole");
const terminalStatus = document.getElementById("terminalStatus");
const clearTerminalBtn = document.getElementById("clearTerminalBtn");

// DOM Elements: AI Mentor Sidebar & Hints
const clearChatBtn = document.getElementById("clearChatBtn");
const progressiveHintCard = document.getElementById("progressiveHintCard");
const hintCardLevel = document.getElementById("hintCardLevel");
const hintCardText = document.getElementById("hintCardText");
const nextHintBtn = document.getElementById("nextHintBtn");

const chatMessagesContainer = document.getElementById("chatMessagesContainer");
const aiThinkingRow = document.getElementById("aiThinkingRow");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

// Problem Definition
const PROBLEM_TITLE = "Two Sum";
const PROBLEM_STATEMENT = `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
Assume exactly one valid solution exists. You may not use the same element twice.
Constraints: 2 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9, -10^9 <= target <= 10^9`;

// Workspace State
let currentHintLevel = 1;
let latestTerminalOutput = "";
const chatHistory = [];
let isAiBusy = false;

/* ==============================================================================
   WORKFLOW 2: Authentication Protection & User Profile
   ============================================================================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Unauthenticated visitors are immediately redirected to login
    window.location.replace("login.html");
    return;
  }

  let displayName = user.displayName || user.email.split("@")[0];
  let email = user.email || "";

  // Fetch saved username/profile from Cloud Firestore
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      if (data.username) displayName = data.username;
      else if (data.fullName) displayName = data.fullName;
      if (data.email) email = data.email;
    }
  } catch (err) {
    console.warn("Firestore profile read notice:", err);
  }

  // Populate header profile
  navUserName.textContent = displayName;
  navUserEmail.textContent = email;
  userAvatar.textContent = displayName.charAt(0).toUpperCase();

  // Show protected workspace and hide loading spinner
  loadingScreen.style.display = "none";
  problemWorkspace.style.display = "block";

  // Initialize Monaco C++ editor once DOM is visible
  initCppEditor("editorContainer");
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutUser);
}

/* ==============================================================================
   WORKFLOW 3: Real C++ Code Execution (Run Code via Wandbox)
   ============================================================================== */
runCodeBtn.addEventListener("click", async () => {
  const code = getCppCode().trim();
  const stdin = customStdinInput.value;

  if (!code) {
    terminalConsole.textContent = "Error: Editor is empty. Please write C++ code before running.";
    return;
  }

  terminalStatus.textContent = "Running";
  terminalStatus.className = "status-pill status-running";
  runCodeBtn.disabled = true;
  terminalConsole.textContent = `$ g++ -O3 solution.cpp -o solution\n$ ./solution\n\n[Compiling in remote C++ sandbox...]`;

  const result = await executeCppCode(code, stdin);
  runCodeBtn.disabled = false;

  if (result.isApiError) {
    terminalStatus.textContent = "Execution/API Error";
    terminalStatus.className = "status-pill status-error";
    latestTerminalOutput = result.stderr;
    terminalConsole.textContent = `$ Error during remote execution:\n\n${result.stderr}`;
    return;
  }

  if (result.isTLE) {
    terminalStatus.textContent = "Time Limit Exceeded";
    terminalStatus.className = "status-pill status-tle";
    latestTerminalOutput = "Time Limit Exceeded: Process exceeded CPU time limit.";
    terminalConsole.textContent = `$ Process terminated: Time Limit Exceeded\n\nCheck for infinite loops.`;
    return;
  }

  if (result.compileError) {
    terminalStatus.textContent = "Compilation Error";
    terminalStatus.className = "status-pill status-error";
    latestTerminalOutput = `Compilation Error:\n${result.compileError}`;
    terminalConsole.textContent = `$ g++ -O3 solution.cpp -o solution\n\n${result.compileError}`;
    return;
  }

  if (result.stderr) {
    terminalStatus.textContent = "Runtime Error";
    terminalStatus.className = "status-pill status-error";
    latestTerminalOutput = `Runtime Error:\n${result.stderr}\nOutput:\n${result.stdout}`;
    terminalConsole.textContent = `$ Program exited with error (Code ${result.exitCode})\n\nOutput:\n${result.stdout}\n\nRuntime Error:\n${result.stderr}`;
    return;
  }

  // Execution succeeded
  terminalStatus.textContent = "Accepted / Success";
  terminalStatus.className = "status-pill status-done";
  const displayOutput = result.stdout || "(Process finished successfully with no output)";
  latestTerminalOutput = displayOutput;
  terminalConsole.textContent = `$ Execution finished in ${result.executionTime}s (Exit code: 0)\n\nOutput:\n${displayOutput}`;
});

/* ==============================================================================
   WORKFLOW 3 (cont): Test Suite Evaluation (Submit Solution)
   ============================================================================== */
submitBtn.addEventListener("click", async () => {
  const code = getCppCode().trim();

  if (!code) {
    terminalConsole.textContent = "Error: Editor is empty. Write C++ code before submitting.";
    return;
  }

  terminalStatus.textContent = "Running";
  terminalStatus.className = "status-pill status-running";
  submitBtn.disabled = true;
  terminalConsole.textContent = `$ Compiling and executing against test cases...`;

  const testResult = await submitTwoSumSolution(code);
  submitBtn.disabled = false;

  terminalStatus.textContent = testResult.verdict;
  if (testResult.verdict === "Accepted") {
    terminalStatus.className = "status-pill status-done";
  } else if (testResult.verdict === "Time Limit Exceeded") {
    terminalStatus.className = "status-pill status-tle";
  } else {
    terminalStatus.className = "status-pill status-error";
  }

  const banner = 
`============================================================
SUBMISSION VERDICT: ${testResult.verdict.toUpperCase()}
Execution Time:     ${testResult.executionTime}s
============================================================

${testResult.details}`;

  latestTerminalOutput = banner;
  terminalConsole.textContent = banner;
});

/* ==============================================================================
   Reset & Terminal Clear
   ============================================================================== */
resetBtn.addEventListener("click", () => {
  const current = getCppCode().trim();
  if (current && current !== STARTER_CPP_CODE.trim()) {
    if (!confirm("Are you sure you want to reset your C++ code to the default starter template?")) {
      return;
    }
  }

  resetCppCode();
  customStdinInput.value = "";
  terminalStatus.textContent = "Ready";
  terminalStatus.className = "status-pill status-ready";
  terminalConsole.textContent = "$ Editor and terminal reset to default starter template.";

  // Reset hints
  currentHintLevel = 1;
  progressiveHintCard.classList.remove("is-visible");
  hintCardText.textContent = "";
  hintCardLevel.textContent = "Hint Level 1 (NORMAL)";
});

clearTerminalBtn.addEventListener("click", () => {
  terminalConsole.textContent = "$ Terminal cleared.";
  terminalStatus.textContent = "Ready";
  terminalStatus.className = "status-pill status-ready";
});

/* ==============================================================================
   WORKFLOW 5: Progressive Hint System (Single Hint visible at a time)
   ============================================================================== */
function setAiBusyState(busy) {
  isAiBusy = busy;
  sendChatBtn.disabled = busy;
  getHintBtn.disabled = busy;
  nextHintBtn.disabled = busy;
  chatInput.disabled = busy;

  if (busy) {
    aiThinkingRow.classList.add("is-active");
  } else {
    aiThinkingRow.classList.remove("is-active");
  }
}

async function triggerProgressiveHint(level) {
  if (isAiBusy) return;

  const mode = hintModeSelect.value;
  hintCardLevel.textContent = `Hint Level ${level} of 5 (${mode})`;
  hintCardText.textContent = `AI is analyzing your current C++ code and preparing Hint Level ${level}...`;
  progressiveHintCard.classList.add("is-visible");

  setAiBusyState(true);

  try {
    const hint = await requestProgressiveHint({
      currentCode: getCppCode(),
      problemTitle: PROBLEM_TITLE,
      problemStatement: PROBLEM_STATEMENT,
      terminalOutput: latestTerminalOutput,
      hintMode: mode,
      hintLevel: level,
      chatHistory: chatHistory
    });

    hintCardText.textContent = hint;

    // Add hint to chat context so student can ask follow-up questions
    chatHistory.push({
      role: "assistant",
      text: `[Progressive Hint Level ${level} - ${mode} Mode]: ${hint}`
    });
  } finally {
    setAiBusyState(false);
  }
}

// "Get Hint" button generates current hint level
getHintBtn.addEventListener("click", () => {
  if (!isAiBusy) triggerProgressiveHint(currentHintLevel);
});

// "Next Hint" advances through levels 1 to 5
nextHintBtn.addEventListener("click", () => {
  if (isAiBusy) return;
  currentHintLevel = currentHintLevel < 5 ? currentHintLevel + 1 : 1;
  triggerProgressiveHint(currentHintLevel);
});

/* ==============================================================================
   WORKFLOW 4: AI Mentor Chat Sidebar (Context-Aware)
   ============================================================================== */
function appendChatMessage(sender, text) {
  const row = document.createElement("div");
  row.className = `chat-message-row ${sender}`;

  const label = document.createElement("span");
  label.className = "chat-sender-label";
  label.textContent = sender === "user" ? "YOU" : "AI MENTOR";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;

  row.appendChild(label);
  row.appendChild(bubble);

  chatMessagesContainer.insertBefore(row, aiThinkingRow);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

async function handleSendChatMessage() {
  if (isAiBusy) return;

  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.value = "";
  appendChatMessage("user", message);
  chatHistory.push({ role: "user", text: message });

  setAiBusyState(true);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  try {
    const aiResponse = await sendChatMessage({
      message: message,
      currentCode: getCppCode(),
      problemTitle: PROBLEM_TITLE,
      problemStatement: PROBLEM_STATEMENT,
      terminalOutput: latestTerminalOutput,
      hintMode: hintModeSelect.value,
      chatHistory: chatHistory
    });

    appendChatMessage("ai", aiResponse);
    chatHistory.push({ role: "assistant", text: aiResponse });
  } finally {
    setAiBusyState(false);
  }
}

sendChatBtn.addEventListener("click", handleSendChatMessage);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendChatMessage();
  }
});

clearChatBtn.addEventListener("click", () => {
  chatHistory.length = 0;
  const messageRows = chatMessagesContainer.querySelectorAll(".chat-message-row");
  messageRows.forEach((row, index) => {
    if (index > 0) row.remove(); // Keep first greeting
  });
});
