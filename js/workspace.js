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
import { sendChatMessage, requestProgressiveHint, formatMarkdown, getFastGreetingResponse, isFullCodeRequest } from "./ai.js";
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

// DOM Elements: Terminal
const terminalConsole = document.getElementById("terminalConsole");
const terminalStatus = document.getElementById("terminalStatus");
const clearTerminalBtn = document.getElementById("clearTerminalBtn");

// DOM Elements: AI Mentor Sidebar & Hints
const clearChatBtn = document.getElementById("clearChatBtn");
const nextHintBtn = document.getElementById("nextHintBtn");

const chatMessagesContainer = document.getElementById("chatMessagesContainer");
const aiThinkingRow = document.getElementById("aiThinkingRow");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

// Active State
const urlParams = new URLSearchParams(window.location.search);
const requestedId = parseInt(urlParams.get("id"), 10) || 1;
let currentProblem = PROBLEMS.find(item => item.id === requestedId) || PROBLEMS[0];
let currentUser = null;
let isEditorInitialized = false;
let activeAsyncOpId = 0;

const problemHintLevels = { 1: 1, 2: 1, 3: 1 };
const problemPreviousHints = { 1: [], 2: [], 3: [] };
const problemChatHistory = { 1: [], 2: [], 3: [] };
const problemFullCodeConsent = { 1: false, 2: false, 3: false };
let lastFailedInteraction = null;
let latestTerminalOutput = "";
let isAiBusy = false;

/**
 * Renders problem statement, examples, and constraints into the left panel
 */
function renderProblemPanel(p) {
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
  document.title = `${p.title} - CodeMentor C++ Workspace`;

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
}

// Synchronously render the requested problem on initial script load to prevent flashing/switching
renderProblemPanel(currentProblem);

/**
 * Loads problem by ID and updates the workspace UI
 */
function loadProblem(problemId, updateUrl = true) {
  activeAsyncOpId++; // Invalidate any in-flight execution or submission responses
  const p = PROBLEMS.find(item => item.id === Number(problemId)) || PROBLEMS[0];
  currentProblem = p;

  if (updateUrl) {
    const newUrl = `${window.location.pathname}?id=${p.id}`;
    window.history.pushState({ problemId: p.id }, "", newUrl);
  }

  // Update Left Panel
  renderProblemPanel(p);

  // Update Monaco Code
  const storageKey = `codementor_code_cpp_p${p.id}`;
  const savedCode = localStorage.getItem(storageKey);
  const codeToLoad = savedCode || p.starterCode;
  setCppCode(codeToLoad);

  // Update hint controls and chat view for this problem
  updateHintButtons();
  renderCurrentProblemChat();

  if (runCodeBtn) runCodeBtn.disabled = false;
  if (submitBtn) submitBtn.disabled = false;

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

  if (!isEditorInitialized) {
    isEditorInitialized = true;
    const storageKey = `codementor_code_cpp_p${currentProblem.id}`;
    const initialCode = localStorage.getItem(storageKey) || currentProblem.starterCode;

    // Initialize Monaco Editor with initial code & change persistence
    initCppEditor("editorContainer", (newCode) => {
      if (currentProblem) {
        localStorage.setItem(`codementor_code_cpp_p${currentProblem.id}`, newCode);
      }
    }, initialCode);

    // Load problem content
    loadProblem(currentProblem.id, false);
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutUser);
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
  const stdin = (currentProblem && currentProblem.defaultStdin) ? currentProblem.defaultStdin : "";

  if (!code) {
    terminalConsole.textContent = "Error: Editor is empty. Please write C++ code before running.";
    return;
  }

  const opSeq = ++activeAsyncOpId;
  const targetPid = currentProblem.id;

  terminalStatus.textContent = "Running";
  terminalStatus.className = "status-pill status-running";
  runCodeBtn.disabled = true;
  terminalConsole.textContent = `$ g++ -O3 solution.cpp -o solution\n$ ./solution\n\n[Compiling in remote C++ sandbox...]`;

  const result = await executeCppCode(code, stdin);

  // Discard stale response if another operation or problem switch occurred
  if (opSeq !== activeAsyncOpId || currentProblem.id !== targetPid) {
    return;
  }

  runCodeBtn.disabled = false;

  // Track problem attempt (only counted on actual code execution)
  if (currentUser) {
    trackProblemProgress(currentUser.uid, targetPid, { attempted: true });
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

  if (result.stderr || (result.exitCode && result.exitCode !== "0")) {
    terminalStatus.textContent = "Runtime Error";
    terminalStatus.className = "status-pill status-error";
    latestTerminalOutput = `Runtime Error:\n${result.stderr}\nOutput:\n${result.stdout}`;
    terminalConsole.textContent = `$ Program exited with error (Code ${result.exitCode})\n\nOutput:\n${result.stdout}\n\nRuntime Error:\n${result.stderr}`;
    return;
  }

  // Execution succeeded (Run finished with exit code 0)
  terminalStatus.textContent = "Finished";
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

  const opSeq = ++activeAsyncOpId;
  const targetPid = currentProblem.id;
  const targetTitle = currentProblem.title;

  terminalStatus.textContent = "Running";
  terminalStatus.className = "status-pill status-running";
  submitBtn.disabled = true;
  terminalConsole.textContent = `$ Compiling and executing against test suite for Problem ${targetPid} (${targetTitle})...`;

  const testResult = await submitSolution(targetPid, code);

  // Discard stale response if another operation or problem switch occurred
  if (opSeq !== activeAsyncOpId || currentProblem.id !== targetPid) {
    return;
  }

  submitBtn.disabled = false;

  const verdict = testResult && testResult.verdict ? testResult.verdict : "Submission Error";
  const isAccepted = verdict === "Accepted";

  // Track problem submission and verdict (genuine Accepted marks solved)
  if (currentUser) {
    trackProblemProgress(currentUser.uid, targetPid, {
      attempted: true,
      solved: isAccepted
    });
  }

  terminalStatus.textContent = verdict;
  if (isAccepted) {
    terminalStatus.className = "status-pill status-done";
  } else if (verdict === "Time Limit Exceeded") {
    terminalStatus.className = "status-pill status-tle";
  } else {
    terminalStatus.className = "status-pill status-error";
  }

  const executionTime = testResult && testResult.executionTime ? testResult.executionTime : "0.00";
  const details = testResult && testResult.details ? testResult.details : "No details returned.";

  const banner = 
`============================================================
SUBMISSION VERDICT: ${verdict.toUpperCase()}
Problem:            #${targetPid} - ${targetTitle}
Execution Time:     ${executionTime}s
============================================================

${details}`;

  latestTerminalOutput = banner;
  terminalConsole.textContent = banner;
});

/* ==============================================================================
   Reset & Terminal Clear
   ============================================================================== */
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    if (!currentProblem) return;

    // 1. Read default C++ starter template for currently selected problem
    const starter = currentProblem.starterCode || "";

    // 2 & 3. Replace Monaco editor contents immediately with that starter template
    setCppCode(starter);

    // Save restored code to localStorage for the active problem
    localStorage.setItem(`codementor_code_cpp_p${currentProblem.id}`, starter);
  });
}

clearTerminalBtn.addEventListener("click", () => {
  terminalConsole.textContent = "$ Terminal cleared.";
  terminalStatus.textContent = "Ready";
  terminalStatus.className = "status-pill status-ready";
});

/* ==============================================================================
   WORKFLOW 4 & 5: Unified Context-Aware AI Mentor Chat & Progressive Hint System
   ============================================================================== */

/**
 * Updates Get Hint and Next Hint buttons based on current problem's hint level (1 to 4).
 */
function updateHintButtons() {
  const pid = currentProblem?.id || 1;
  const level = problemHintLevels[pid] || 1;
  if (!getHintBtn || !nextHintBtn) return;

  if (level === 1) {
    getHintBtn.style.display = "inline-flex";
    getHintBtn.innerHTML = "<span>💡</span> Get Hint";
    getHintBtn.disabled = isAiBusy;
    nextHintBtn.style.display = "none";
  } else if (level <= 4) {
    getHintBtn.style.display = "none";
    nextHintBtn.style.display = "inline-flex";
    nextHintBtn.innerHTML = `<span>💡</span> Next Hint (${level}/4)`;
    nextHintBtn.disabled = isAiBusy;
    nextHintBtn.title = `Ask AI for Hint Level ${level} of 4`;
  } else {
    getHintBtn.style.display = "none";
    nextHintBtn.style.display = "inline-flex";
    nextHintBtn.innerHTML = `<span>💡</span> All Hints Given`;
    nextHintBtn.disabled = true;
    nextHintBtn.title = "All 4 progressive hints have been unlocked";
  }
}

/**
 * Renders the active problem's conversation history in the chat panel.
 */
function renderCurrentProblemChat() {
  if (!chatMessagesContainer) return;
  const pid = currentProblem?.id || 1;
  const history = problemChatHistory[pid] || [];

  // Remove existing dynamic message rows, preserving only the initial welcome message (row 0)
  const rows = chatMessagesContainer.querySelectorAll(".chat-message-row");
  rows.forEach((row, idx) => {
    if (idx > 0) row.remove();
  });

  for (const item of history) {
    appendChatMessageToDom(item.role === "user" ? "user" : "ai", item.text);
  }
}

/**
 * Appends a message bubble directly into the chat DOM with Markdown support.
 */
function appendChatMessageToDom(sender, text) {
  if (!chatMessagesContainer) return;

  const row = document.createElement("div");
  row.className = `chat-message-row ${sender}`;

  const label = document.createElement("span");
  label.className = "chat-sender-label";
  label.textContent = sender === "user" ? "YOU" : "AI MENTOR";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  if (sender === "user") {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = formatMarkdown(text);
  }

  row.appendChild(label);
  row.appendChild(bubble);

  chatMessagesContainer.insertBefore(row, aiThinkingRow);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

/**
 * Appends a message to active problem state and DOM.
 */
function appendChatMessage(sender, text) {
  const pid = currentProblem?.id || 1;
  if (!problemChatHistory[pid]) {
    problemChatHistory[pid] = [];
  }
  problemChatHistory[pid].push({
    role: sender === "user" ? "user" : "assistant",
    text: text
  });

  appendChatMessageToDom(sender, text);
}

/**
 * Appends an AI message with interactive choice buttons (e.g. for Full-Code Consent).
 */
function appendChatMessageWithChoices(aiText, choices = []) {
  const pid = currentProblem?.id || 1;
  if (!problemChatHistory[pid]) {
    problemChatHistory[pid] = [];
  }
  problemChatHistory[pid].push({
    role: "assistant",
    text: aiText
  });

  const row = document.createElement("div");
  row.className = "chat-message-row ai";

  const label = document.createElement("span");
  label.className = "chat-sender-label";
  label.textContent = "AI MENTOR";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.innerHTML = formatMarkdown(aiText);

  if (Array.isArray(choices) && choices.length > 0) {
    const choicesGroup = document.createElement("div");
    choicesGroup.className = "chat-choices-group";

    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn-chat-choice ${choice.action === "full_code" ? "choice-fullcode" : "choice-hints"}`;
      btn.textContent = choice.label;
      btn.addEventListener("click", () => {
        // Disable choices once selected
        const allBtns = choicesGroup.querySelectorAll("button");
        allBtns.forEach(b => (b.disabled = true));

        if (choice.action === "full_code") {
          problemFullCodeConsent[currentProblem.id] = true;
          sendAiInteraction({
            message: "Show full code",
            requestType: "chat",
            fullCodeConsent: true
          });
        } else if (choice.action === "hints") {
          handleHintRequest();
        }
      });
      choicesGroup.appendChild(btn);
    }
    bubble.appendChild(choicesGroup);
  }

  row.appendChild(label);
  row.appendChild(bubble);

  chatMessagesContainer.insertBefore(row, aiThinkingRow);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

/**
 * Sets busy loading state on UI elements.
 */
function setAiBusyState(busy) {
  isAiBusy = busy;
  if (sendChatBtn) sendChatBtn.disabled = busy;
  if (getHintBtn) getHintBtn.disabled = busy;
  if (nextHintBtn) {
    const pid = currentProblem?.id || 1;
    const level = problemHintLevels[pid] || 1;
    nextHintBtn.disabled = busy || (level > 4);
  }
  if (chatInput) chatInput.disabled = busy;

  if (busy) {
    aiThinkingRow.classList.add("is-active");
  } else {
    aiThinkingRow.classList.remove("is-active");
  }
}

/**
 * Unified pipeline for sending user chat messages and progressive hint requests.
 * Uses real-time progressive token streaming via SSE.
 */
async function sendAiInteraction({
  message,
  requestType = "chat",
  hintLevel = null,
  fullCodeConsent = false,
  isRetry = false
}) {
  if (isAiBusy) return;

  const pid = currentProblem?.id || 1;
  const history = problemChatHistory[pid] || [];

  // 1. Add user message to UI and history (unless repeating via retry)
  if (!isRetry) {
    appendChatMessage("user", message);
  }

  // 2. Set busy state
  setAiBusyState(true);

  // 3. Prepare AI message bubble in DOM for progressive streaming
  const aiRow = document.createElement("div");
  aiRow.className = "chat-message-row ai";

  const label = document.createElement("span");
  label.className = "chat-sender-label";
  label.textContent = "AI MENTOR";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.innerHTML = `<span class="streaming-cursor">Analyzing C++ context...</span>`;

  aiRow.appendChild(label);
  aiRow.appendChild(bubble);

  chatMessagesContainer.insertBefore(aiRow, aiThinkingRow);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  let streamStarted = false;

  try {
    const aiResponse = await sendChatMessage({
      message: message,
      requestType: requestType,
      hintLevel: hintLevel,
      currentCode: getCppCode(),
      problemId: currentProblem.id,
      problemTitle: currentProblem.title,
      problemStatement: currentProblem.statement.replace(/<[^>]+>/g, ""),
      problemConstraints: currentProblem.constraints,
      terminalOutput: latestTerminalOutput,
      hintMode: hintModeSelect ? hintModeSelect.value : "NORMAL",
      previousHints: problemPreviousHints[currentProblem.id] || [],
      chatHistory: history,
      fullCodeConsent: fullCodeConsent || problemFullCodeConsent[currentProblem.id] || false,
      onToken: (_chunk, accumulatedText) => {
        if (!streamStarted) {
          streamStarted = true;
          aiThinkingRow.classList.remove("is-active");
        }
        bubble.innerHTML = formatMarkdown(accumulatedText);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }
    });

    // Final formatted render
    bubble.innerHTML = formatMarkdown(aiResponse);

    // Record in problem chat history
    if (!problemChatHistory[pid]) {
      problemChatHistory[pid] = [];
    }
    problemChatHistory[pid].push({
      role: "assistant",
      text: aiResponse
    });

    // 4. If this was a progressive hint, record it and advance hint level
    if (requestType === "hint") {
      if (!problemPreviousHints[currentProblem.id]) {
        problemPreviousHints[currentProblem.id] = [];
      }
      problemPreviousHints[currentProblem.id].push(aiResponse);

      const currentLvl = problemHintLevels[currentProblem.id] || 1;
      if (currentLvl <= 4) {
        problemHintLevels[currentProblem.id] = currentLvl + 1;
      }
      updateHintButtons();
    }

    lastFailedInteraction = null;
  } catch (error) {
    console.error("AI Interaction Error:", error);
    lastFailedInteraction = { message, requestType, hintLevel, fullCodeConsent };

    bubble.innerHTML = `
      <div class="chat-error-box">
        <span style="color: var(--danger); font-weight: 600;">⚠️ ${formatMarkdown(error.message || "Could not reach AI Mentor. Ollama may be busy or unavailable.")}</span>
        <div class="chat-error-actions">
          <button type="button" class="btn-chat-retry">↺ Retry Request</button>
        </div>
      </div>
    `;

    const retryBtn = bubble.querySelector(".btn-chat-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        aiRow.remove();
        if (lastFailedInteraction) {
          sendAiInteraction({
            ...lastFailedInteraction,
            isRetry: true
          });
        }
      });
    }
  } finally {
    setAiBusyState(false);
    updateHintButtons();
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
}

/**
 * Hint button handler: triggers "Give me a hint." or "Give me the next hint, please."
 */
function handleHintRequest() {
  if (isAiBusy) return;
  const pid = currentProblem?.id || 1;
  const level = problemHintLevels[pid] || 1;

  if (level > 4) return;

  const userText = level === 1 ? "Give me a hint." : "Give me the next hint, please.";

  sendAiInteraction({
    message: userText,
    requestType: "hint",
    hintLevel: level
  });
}

if (getHintBtn) {
  getHintBtn.addEventListener("click", handleHintRequest);
}

if (nextHintBtn) {
  nextHintBtn.addEventListener("click", handleHintRequest);
}

/**
 * Ordinary chat handler with greeting fast-path and full-code consent check
 */
function handleSendChatMessage() {
  if (isAiBusy) return;

  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.value = "";

  // 1. Instant greeting fast path (0ms delay, no Ollama inference)
  const fastGreeting = getFastGreetingResponse(message);
  if (fastGreeting) {
    appendChatMessage("user", message);
    appendChatMessage("ai", fastGreeting);
    return;
  }

  // 2. Full-code request consent check
  const wantsFullCode = isFullCodeRequest(message);
  if (wantsFullCode && !problemFullCodeConsent[currentProblem.id]) {
    appendChatMessage("user", message);
    appendChatMessageWithChoices(
      "I can guide you with progressive hints or show the complete C++ solution. Which would you prefer?",
      [
        { label: "💡 Give me hints", action: "hints" },
        { label: "💻 Show full code", action: "full_code" }
      ]
    );
    return;
  }

  // 3. Standard AI mentor interaction
  sendAiInteraction({
    message: message,
    requestType: "chat",
    hintLevel: null,
    fullCodeConsent: wantsFullCode && problemFullCodeConsent[currentProblem.id]
  });
}

if (sendChatBtn) {
  sendChatBtn.addEventListener("click", handleSendChatMessage);
}

if (chatInput) {
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  });
}

if (clearChatBtn) {
  clearChatBtn.addEventListener("click", () => {
    const pid = currentProblem?.id || 1;
    problemChatHistory[pid] = [];
    const messageRows = chatMessagesContainer.querySelectorAll(".chat-message-row");
    messageRows.forEach((row, index) => {
      if (index > 0) row.remove();
    });
  });
}
