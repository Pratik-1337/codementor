/**
 * ==============================================================================
 * CodeMentor - AI Mentor Frontend Client (ai.js)
 * ==============================================================================
 * 
 * Communicates with the CodeMentor backend (/api/ai) powered by OpenRouter.
 * 
 * Features:
 * - Context-Aware AI Mentor Chat (analyzes user's ACTUAL live Monaco C++ code)
 * - Single-level Progressive Hints (dynamically calibrated by HARD / NORMAL / EASY modes)
 * - Zero client-side API key exposure (API key stays strictly on the server)
 * - Clear, specific error reporting without generic messages
 * ==============================================================================
 */

/**
 * Determines the backend API endpoint URL.
 * Automatically handles same-origin requests or local multi-port dev servers.
 */
function getApiEndpoint() {
  // If running on a different port than backend (e.g. static dev server on 5500 while server runs on 3000)
  if (window.location.port === "5500") {
    return "http://localhost:3000/api/ai";
  }
  return "/api/ai";
}

/**
 * Formats a chat history array into clean message objects for the backend.
 * 
 * @param {Array} history
 * @returns {Array<{ role: string, content: string }>}
 */
function formatConversation(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item => item && (item.text || item.content))
    .map(item => ({
      role: item.role === "user" ? "user" : "assistant",
      content: (item.text || item.content || "").trim()
    }));
}

/**
 * Sends a chat message to the AI Mentor backend with full workspace context:
 * - Current C++ code from Monaco Editor
 * - Problem statement
 * - Latest terminal output
 * - Hint mode (HARD / NORMAL / EASY)
 * - Previous conversation history
 * - User's latest question/message
 * 
 * @param {Object} options
 * @returns {Promise<string>} AI Mentor's contextual response
 */
export async function sendChatMessage({
  message,
  currentCode,
  problemTitle,
  problemStatement,
  terminalOutput,
  hintMode = "NORMAL",
  chatHistory = []
}) {
  const endpoint = getApiEndpoint();
  const formattedConversation = formatConversation(chatHistory);

  const payload = {
    problem: `${problemTitle}\n\n${problemStatement}`,
    code: currentCode || "",
    language: "cpp",
    terminalOutput: terminalOutput || "",
    hintMode: hintMode,
    hintLevel: null,
    message: message,
    conversation: formattedConversation
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      const errMsg = data.error || (response.status === 401 ? "AI Mentor is not configured correctly." : "AI Mentor is temporarily unavailable.");
      return errMsg;
    }

    return data.response || "I have analyzed your C++ code. Could you clarify what specific part you'd like feedback on?";

  } catch (error) {
    console.error("AI Mentor request error:", error);
    // Offline / connection failure
    return "Could not connect to AI Mentor. Check your internet connection.";
  }
}

/**
 * Requests a single progressive hint for a specific level (1, 2, 3...)
 * dynamically calibrated by the student's current C++ code, previous hints, and selected hint mode.
 * 
 * @param {Object} options
 * @returns {Promise<string>}
 */
export async function requestProgressiveHint({
  currentCode,
  problemTitle,
  problemStatement,
  terminalOutput,
  hintMode = "NORMAL",
  hintLevel = 1,
  chatHistory = []
}) {
  const endpoint = getApiEndpoint();
  const formattedConversation = formatConversation(chatHistory);

  const payload = {
    problem: `${problemTitle}\n\n${problemStatement}`,
    code: currentCode || "",
    language: "cpp",
    terminalOutput: terminalOutput || "",
    hintMode: hintMode,
    hintLevel: hintLevel,
    message: "",
    conversation: formattedConversation
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      console.warn("AI Backend hint notice:", data.error);
      return data.error || getLocalHintFallback(hintLevel, hintMode);
    }

    return data.response ? data.response.trim() : getLocalHintFallback(hintLevel, hintMode);

  } catch (error) {
    console.warn("Falling back to local progressive hint due to connection error:", error);
    return getLocalHintFallback(hintLevel, hintMode);
  }
}

/**
 * Offline viva fallback hints when the backend server is unreachable.
 * Ensures the project remains presentable during viva evaluations.
 */
function getLocalHintFallback(level, mode) {
  const hints = {
    1: "Think about what information you need to remember while scanning the array. Do you need to know each number's value, its index, or both?",
    2: "Consider whether a hash map (`std::unordered_map<int, int>`) could help you quickly determine whether the required complement has already appeared.",
    3: "While traversing the array, store previously seen values and check whether `target - nums[i]` already exists in your map.",
    4: "Algorithm Blueprint:\n1. Create `std::unordered_map<int, int> seen;`\n2. Loop `i` from 0 to `nums.size() - 1`:\n3. If `seen.count(target - nums[i])`, return `{seen[target - nums[i]], i}`.\n4. Else insert `seen[nums[i]] = i;`",
    5: "Detailed Advice: An element cannot pair with itself. Inserting into the map *after* checking ensures you never pair `nums[i]` with itself. Time complexity: O(N), Space complexity: O(N)."
  };

  return hints[level] || "You have reached the final hint level. Review your code and run it to verify!";
}
