/**
 * ==============================================================================
 * CodeMentor - Problem Workspace Controller (workspace.js)
 * ==============================================================================
 * 
 * Coordinates the 3-column C++ learning workspace:
 * 1. Authentication check & user profile header
 * 2. Problem selection & dynamic switching (Easy, Medium, Hard)
 * 3. Monaco C++ Editor initialization & per-problem code state
 * 4. Remote C++ compilation & execution (Run Code via Wandbox)
 * 5. Test case evaluation & verdict banner (Submit Solution)
 * 6. Progressive Hint System (Single-level unlocks: 1 to 5, HARD/NORMAL/EASY)
 * 7. Context-Aware AI Mentor Chat (analyzes live C++ code & terminal output)
 * ==============================================================================
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { logoutUser } from "./auth.js";
import { initCppEditor, getCppCode, setCppCode } from "./editor.js";
import { executeCppCode, submitSolution } from "./execution.js";
import { sendChatMessage, requestProgressiveHint } from "./ai.js";
import { PROBLEMS } from "./problems-data.js";
import { trackProblemProgress } from "./progress.js";

export { PROBLEMS };

// DOM Elements: Navigation & Auth
const loadingScreen = document.getElementById("loadingScreen");
const problemWorkspace = document.getElementById("problemWorkspace");
const navUserName = document.getElementById("navUserName");
const navUserEmail = document.getElementById("navUserEmail");
const userAvatar = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");

// DOM Elements: Problem Left Panel
const problemSelector = document.getElementById("problemSelector");
const problemDifficultyBadge = document.getElementById("problemDifficultyBadge");
const problemNumberLabel = document.getElementById("problemNumberLabel");
const problemTitleHeader = document.getElementById("problemTitleHeader");
const problemContentContainer = document.getElementById("problemContentContainer");

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

// Active State
let currentUser = null;
let currentProblem = PROBLEMS[0];
let currentHintLevel = 1;
let latestTerminalOutput = "";
const chatHistory = [];
let isAiBusy = false;

/**
 * Loads problem by ID and updates the workspace UI
 */
function loadProblem(problemId, updateUrl = true) {
  const p = PROBLEMS.find(item => item.id === Number(problemId)) || PROBLEMS[0];
  currentProblem = p;

  if (updateUrl) {
    const newUrl = `${window.location.pathname}?id=${p.id}`;
    window.history.pushState({ problemId: p.id }, "", newUrl);
  }

  // Update Left Panel
  if (problemDifficultyBadge) {
    problemDifficultyBadge.textContent = p.difficulty;
    problemDifficultyBadge.className = p.difficultyClass;
  }
  if (problemNumberLabel) {
    problemNumberLabel.textContent = `Problem #${p.id}`;
  }
  if (problemTitleHeader) {
    problemTitleHeader.textContent = p.title;
  }
  if (problemSelector) {
    problemSelector.value = p.id;
  }

  if (problemContentContainer) {
    let html = `<p class="problem-description">${p.statement}</p>`;

    p.examples.forEach((ex, idx) => {
      html += `
        <h2 class="problem-section-title">Example ${idx + 1}</h2>
        <div class="example-card">
          <div class="example-line"><span class="example-label">Input:</span> <span class="example-val">${ex.input}</span></div>
          <div class="example-line"><span class="example-label">Output:</span> <span class="example-val">${ex.output}</span></div>
          ${ex.explanation ? `<div class="example-line"><span class="example-label">Explanation:</span> <span class="example-val">${ex.explanation}</span></div>` : ""}
        </div>
      `;
    });

    html += `<h2 class="problem-section-title">Constraints</h2><ul class="constraints-list">`;
    p.constraints.forEach(c => {
      html += `<li><code>${c}</code></li>`;
    });
    html += `</ul>`;

    problemContentContainer.innerHTML = html;
  }

  // Update Monaco Code
  const storageKey = `codementor_code_cpp_p${p.id}`;
  const savedCode = localStorage.getItem(storageKey);
  const codeToLoad = savedCode || p.starterCode;
  setCppCode(codeToLoad);

  // Update stdin
  if (customStdinInput) {
    customStdinInput.value = p.defaultStdin;
  }

  // Reset hints & terminal
  currentHintLevel = 1;
  if (progressiveHintCard) {
    progressiveHintCard.classList.remove("is-visible");
  }
  if (hintCardText) hintCardText.textContent = "";
  if (hintCardLevel) hintCardLevel.textContent = `Hint Level 1 (${hintModeSelect ? hintModeSelect.value : "NORMAL"})`;

  if (terminalStatus) {
    terminalStatus.textContent = "Ready";
    terminalStatus.className = "status-pill status-ready";
  }
  if (terminalConsole) {
    terminalConsole.textContent = `$ Ready to compile and execute C++ for Problem ${p.id} (${p.title}). Click 'Run Code' or 'Submit'.`;
  }
  latestTerminalOutput = "";
}

/* ==============================================================================
   WORKFLOW 2: Authentication Protection & User Profile
   ============================================================================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    window.location.replace("login.html");
    return;
  }

  currentUser = user;

  let displayName = user.displayName || user.email.split("@")[0];
  let email = user.email || "";

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

  if (navUserName) navUserName.textContent = displayName;
  if (navUserEmail) navUserEmail.textContent = email;
  if (userAvatar) userAvatar.textContent = displayName.charAt(0).toUpperCase();

  // Show workspace
  loadingScreen.style.display = "none";
  problemWorkspace.style.display = "block";

  // Check URL query parameter (?id=1, ?id=2, ?id=3)
  const urlParams = new URLSearchParams(window.location.search);
  const requestedId = parseInt(urlParams.get("id"), 10) || 1;

  // Initialize Monaco Editor with change persistence
  initCppEditor("editorContainer", (newCode) => {
    localStorage.setItem(`codementor_code_cpp_p${currentProblem.id}`, newCode);
  });

  // Load problem content
  loadProblem(requestedId, false);
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutUser);
}

// Problem Selector Dropdown
if (problemSelector) {
  problemSelector.addEventListener("change", (e) => {
    loadProblem(e.target.value, true);
  });
}

// Support browser back/forward buttons
window.addEventListener("popstate", (e) => {
  const urlParams = new URLSearchParams(window.location.search);
  const id = parseInt(urlParams.get("id"), 10) || 1;
  loadProblem(id, false);
});

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

  // Track problem attempt (only counted on actual code execution)
  if (currentUser) {
    trackProblemProgress(currentUser.uid, currentProblem.id, { attempted: true });
  }

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
  terminalConsole.textContent = `$ Compiling and executing against test suite for Problem ${currentProblem.id} (${currentProblem.title})...`;

  const testResult = await submitSolution(currentProblem.id, code);
  submitBtn.disabled = false;

  // Track problem submission and verdict (genuine Accepted marks solved)
  if (currentUser) {
    const isAccepted = testResult.verdict === "Accepted";
    trackProblemProgress(currentUser.uid, currentProblem.id, {
      attempted: true,
      solved: isAccepted
    });
  }

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
Problem:            #${currentProblem.id} - ${currentProblem.title}
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
  if (current && current !== currentProblem.starterCode.trim()) {
    if (!confirm(`Are you sure you want to reset your C++ code to the starter template for ${currentProblem.title}?`)) {
      return;
    }
  }

  setCppCode(currentProblem.starterCode);
  customStdinInput.value = currentProblem.defaultStdin;
  terminalStatus.textContent = "Ready";
  terminalStatus.className = "status-pill status-ready";
  terminalConsole.textContent = `$ Editor and terminal reset to starter template for ${currentProblem.title}.`;

  // Reset hints
  currentHintLevel = 1;
  progressiveHintCard.classList.remove("is-visible");
  hintCardText.textContent = "";
  hintCardLevel.textContent = `Hint Level 1 (${hintModeSelect.value})`;
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
  hintCardText.textContent = `AI is analyzing your C++ code for ${currentProblem.title} and preparing Hint Level ${level}...`;
  progressiveHintCard.classList.add("is-visible");

  setAiBusyState(true);

  try {
    const hint = await requestProgressiveHint({
      currentCode: getCppCode(),
      problemTitle: currentProblem.title,
      problemStatement: currentProblem.statement.replace(/<[^>]+>/g, ""),
      terminalOutput: latestTerminalOutput,
      hintMode: mode,
      hintLevel: level,
      chatHistory: chatHistory
    });

    hintCardText.textContent = hint;

    // Add hint to chat context
    chatHistory.push({
      role: "assistant",
      text: `[Progressive Hint Level ${level} for ${currentProblem.title} - ${mode} Mode]: ${hint}`
    });
  } finally {
    setAiBusyState(false);
  }
}

getHintBtn.addEventListener("click", () => {
  if (!isAiBusy) triggerProgressiveHint(currentHintLevel);
});

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
      problemTitle: currentProblem.title,
      problemStatement: currentProblem.statement.replace(/<[^>]+>/g, ""),
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
    if (index > 0) row.remove();
  });
});
