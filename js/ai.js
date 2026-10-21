/**
 * ==============================================================================
 * CodeMentor - AI Mentor Frontend Client (ai.js)
 * ==============================================================================
 * 
 * Communicates with the CodeMentor backend (/api/ai) powered by local Ollama
 * (qwen2.5-coder:7b).
 * 
 * Features:
 * - Real-time progressive token streaming (SSE)
 * - Instant greeting & acknowledgement detection (0ms latency fast-path)
 * - 4-Level Progressive Hint system (Conceptual -> Algorithm -> Steps -> Implementation)
 * - Full-Code Consent Gate (safeguards learning, provides full code upon confirmation)
 * - Context-Aware AI Mentor Chat (analyzes user's ACTUAL live Monaco C++ code)
 * - Clear, user-friendly error reporting directly in the mentor chat stream
 * ==============================================================================
 */

/**
 * Fast deterministic greeting and acknowledgement detector.
 * Returns an instant friendly response for greetings/thanks/farewells
 * without calling Ollama or invoking heavy AI pipelines.
 * Returns null if the message contains coding questions or problem details.
 */
export function getFastGreetingResponse(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return null;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/[!?.,:;'"~`@#$%^&*()_+\-=[\]{}|\\/<>]/g, " ").trim().replace(/\s+/g, " ");

  const greetings = new Set([
    "hi", "hello", "hey", "hey there", "hello there", "good morning", "good afternoon", "good evening", "yo", "sup", "hola"
  ]);

  const thanks = new Set([
    "thanks", "thank you", "thx", "thanks a lot", "thank you so much", "many thanks", "tysm"
  ]);

  const farewells = new Set([
    "bye", "goodbye", "cya", "see you", "bye bye", "have a good day", "see ya"
  ]);

  const acks = new Set([
    "ok", "okay", "got it", "understood", "cool", "great", "awesome", "nice", "k", "alright", "all right"
  ]);

  const strippedAddr = cleaned.replace(/\b(codementor|mentor|ai|bot|assistant)\b/g, "").trim().replace(/\s+/g, " ");

  if (greetings.has(cleaned) || greetings.has(strippedAddr)) {
    return "Hey! What are you working on?";
  }

  if (thanks.has(cleaned) || thanks.has(strippedAddr)) {
    return "You're welcome!";
  }

  if (farewells.has(cleaned) || farewells.has(strippedAddr)) {
    return "Goodbye! Happy coding and good luck with your DSA practice!";
  }

  if (acks.has(cleaned) || acks.has(strippedAddr)) {
    return "Sounds good! Try coding it up or let me know if you get stuck.";
  }

  return null;
}

/**
 * Detects whether the user is explicitly requesting the complete code/solution.
 */
export function isFullCodeRequest(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/[!?.,:;'"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\b(give|show|provide|send)\s+(me\s+)?(the\s+)?(full|complete|entire|whole)\s+(code|solution|program|cpp|implementation)\b/,
    /\b(full|complete|entire|whole)\s+(code|solution|program|implementation)\s*(please)?\b/,
    /\bshow\s+(me\s+)?(the\s+)?(solution|code)\b/,
    /\bi\s+(don'?t|do\s+not)\s+want\s+hints?\b/,
    /\bno\s+hints?\b/,
    /\bjust\s+(give|show)\s+(me\s+)?(the\s+)?code\b/,
    /\bshow\s+full\s+code\b/
  ];

  return patterns.some(p => p.test(cleaned));
}

/**
 * Safely converts Markdown text into sanitized HTML.
 * Escapes all HTML special characters first, protecting against XSS and preserving
 * C++ templates like `unordered_map<int, int>` or `vector<int>`.
 * Handles unclosed code fences smoothly during progressive token streaming.
 * 
 * @param {string} rawText
 * @returns {string} Sanitized HTML string
 */
export function formatMarkdown(rawText) {
  if (!rawText) return "";

  // 1. Initial sanitization: escape all HTML special characters
  let text = String(rawText)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Handle unclosed code fences while streaming tokens
  const fenceMatches = text.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    text += "\n```";
  }

  const codeBlocks = [];
  const inlineCodes = [];

  // 2. Extract fenced code blocks (```lang\ncode\n``` or ```code```)
  // Use safe Unicode Private Use Area tokens without underscores or asterisks
  text = text.replace(/```([a-zA-Z0-9_\-+]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    const langClass = lang ? ` class="language-${lang.trim()}"` : "";
    const cleanedCode = code.replace(/\r?\n$/, "");
    codeBlocks.push(`<pre><code${langClass}>${cleanedCode}</code></pre>`);
    return `\uE000BLOCK${idx}\uE001`;
  });

  text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\uE000BLOCK${idx}\uE001`;
  });

  // Handle unclosed inline code backtick while streaming
  const inlineCount = (text.match(/`/g) || []).length;
  if (inlineCount % 2 !== 0) {
    text += "`";
  }

  // 3. Extract inline code (`code`) using safe tokens WITHOUT underscores
  text = text.replace(/`([^`\n]+?)`/g, (match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${code}</code>`);
    return `\uE002CODE${idx}\uE003`;
  });

  // 4. Split by double newlines into blocks (paragraphs, lists, code blocks)
  const rawBlocks = text.split(/\r?\n\s*\r?\n/);
  const formattedBlocks = [];

  for (let block of rawBlocks) {
    block = block.trim();
    if (!block) continue;

    // Preserve code blocks verbatim
    if (/^\uE000BLOCK\d+\uE001$/.test(block)) {
      formattedBlocks.push(block);
      continue;
    }

    const lines = block.split(/\r?\n/);
    const isBulletList = lines.length > 0 && lines.every(l => /^[\s]*[-*+]\s+/.test(l));
    const isOrderedList = lines.length > 0 && lines.every(l => /^[\s]*\d+\.\s+/.test(l));

    if (isBulletList) {
      const items = lines.map(l => {
        const itemContent = l.replace(/^[\s]*[-*+]\s+/, "");
        return `<li>${formatInline(itemContent)}</li>`;
      }).join("");
      formattedBlocks.push(`<ul>${items}</ul>`);
      continue;
    }

    if (isOrderedList) {
      const items = lines.map(l => {
        const itemContent = l.replace(/^[\s]*\d+\.\s+/, "");
        return `<li>${formatInline(itemContent)}</li>`;
      }).join("");
      formattedBlocks.push(`<ol>${items}</ol>`);
      continue;
    }

    // Check for mixed list items
    const hasList = lines.some(l => /^[\s]*[-*+]\s+/.test(l) || /^[\s]*\d+\.\s+/.test(l));
    if (hasList) {
      let html = "";
      let inUl = false;
      let inOl = false;

      for (const line of lines) {
        if (/^[\s]*[-*+]\s+/.test(line)) {
          if (inOl) { html += "</ol>"; inOl = false; }
          if (!inUl) { html += "<ul>"; inUl = true; }
          html += `<li>${formatInline(line.replace(/^[\s]*[-*+]\s+/, ""))}</li>`;
        } else if (/^[\s]*\d+\.\s+/.test(line)) {
          if (inUl) { html += "</ul>"; inUl = false; }
          if (!inOl) { html += "<ol>"; inOl = true; }
          html += `<li>${formatInline(line.replace(/^[\s]*\d+\.\s+/, ""))}</li>`;
        } else {
          if (inUl) { html += "</ul>"; inUl = false; }
          if (inOl) { html += "</ol>"; inOl = false; }
          if (line.trim()) {
            html += `<p>${formatInline(line.trim())}</p>`;
          }
        }
      }
      if (inUl) html += "</ul>";
      if (inOl) html += "</ol>";
      formattedBlocks.push(html);
      continue;
    }

    // Regular paragraph: preserve single line breaks
    const pContent = lines.map(l => formatInline(l)).join("<br>");
    formattedBlocks.push(`<p>${pContent}</p>`);
  }

  let finalHtml = formattedBlocks.join("");

  // 5. Restore code blocks
  finalHtml = finalHtml.replace(/\uE000BLOCK(\d+)\uE001/g, (m, idx) => codeBlocks[Number(idx)] || "");

  // 6. Restore inline codes
  finalHtml = finalHtml.replace(/\uE002CODE(\d+)\uE003/g, (m, idx) => inlineCodes[Number(idx)] || "");

  return finalHtml;
}

function formatInline(str) {
  let s = str;
  // Bold: **text** or __text__
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* (avoid touching double asterisks)
  s = s.replace(/(?:^|[^\*])\*([^\*\n]+?)\*(?!\*)/g, (match, p1) => {
    const prefix = match.startsWith("*") ? "" : match.charAt(0);
    return `${prefix}<em>${p1}</em>`;
  });

  // Italic: _text_ (only when surrounded by whitespace or boundaries, avoiding variable_names_like_this)
  s = s.replace(/(^|\s)_([^\s_][^_]*?[^\s_]|[^\s_])_(?=\s|[.,!?;:]|$)/g, "$1<em>$2</em>");

  // Strikethrough: ~~text~~
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  return s;
}

/**
 * Determines the backend API endpoint URL.
 */
function getApiEndpoint() {
  if (window.location.port === "5500") {
    return "http://localhost:3000/api/ai";
  }
  return "/api/ai";
}

/**
 * Formats a chat history array into clean message objects for the backend.
 */
function formatConversation(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item => item && (item.text || item.content))
    .slice(-4)
    .map(item => ({
      role: item.role === "user" ? "user" : "assistant",
      content: (item.text || item.content || "").trim().slice(0, 350)
    }));
}

/**
 * Sends a chat or hint message to the AI Mentor backend with full workspace context.
 * Supports token-by-token streaming via SSE for instant responsiveness.
 * 
 * @param {Object} options
 * @param {Function} [options.onToken] - Callback invoked with (chunk, accumulatedText) as tokens arrive
 * @returns {Promise<string>} AI Mentor's full response
 */
export async function sendChatMessage({
  message = "",
  requestType = "chat",
  hintLevel = null,
  currentCode = "",
  problemId = 1,
  problemTitle = "",
  problemStatement = "",
  problemConstraints = [],
  terminalOutput = "",
  hintMode = "NORMAL",
  previousHints = [],
  chatHistory = [],
  fullCodeConsent = false,
  stream = true,
  onToken = null
}) {
  const endpoint = getApiEndpoint();
  const formattedConversation = formatConversation(chatHistory);

  const payload = {
    requestType,
    problemId,
    problemTitle,
    problemStatement,
    problemConstraints,
    code: currentCode || "",
    language: "cpp",
    terminalOutput: terminalOutput || "",
    hintMode: hintMode,
    hintLevel: hintLevel,
    previousHints: previousHints,
    message: message || "",
    conversation: formattedConversation,
    fullCodeConsent: Boolean(fullCodeConsent),
    stream: Boolean(stream)
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Check if the response is SSE stream
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("text/event-stream") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // save incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              throw new Error(data.error);
            }
            if (data.token) {
              accumulatedText += data.token;
              if (typeof onToken === "function") {
                onToken(data.token, accumulatedText);
              }
            }
            if (data.done && data.fullText) {
              accumulatedText = data.fullText;
            }
          } catch (err) {
            if (err.message && !err.message.includes("JSON")) {
              throw err;
            }
          }
        }
      }

      return accumulatedText.trim() || "AI Mentor completed response.";
    }

    // Standard JSON response (e.g. error, fast greeting, or non-streaming)
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      const errMsg = data.error || (response.status === 401 ? "AI Mentor is not configured correctly." : `AI Mentor error (HTTP ${response.status}).`);
      const err = new Error(errMsg);
      err.status = response.status;
      throw err;
    }

    if (data.response) {
      const resp = data.response.trim();
      if (typeof onToken === "function") {
        onToken(resp, resp);
      }
      return resp;
    }

    return "AI Mentor returned an empty response. Please try rephrasing your question.";

  } catch (error) {
    console.error("AI Mentor request error:", error);
    throw error;
  }
}

/**
 * Requests a progressive hint (Levels 1 to 4) via the unified sendChatMessage pipeline.
 */
export async function requestProgressiveHint(options = {}) {
  const level = options.hintLevel || 1;
  const message = level === 1 ? "Give me a hint." : "Give me the next hint, please.";
  return sendChatMessage({
    ...options,
    message: options.message || message,
    requestType: "hint",
    hintLevel: level
  });
}

/**
 * Offline viva fallback hints when the backend server is unreachable.
 * Structured strictly across 4 progressive levels:
 * Level 1: Conceptual hint (core idea in 1-2 sentences, prompt next step, no code)
 * Level 2: Algorithm direction (identify algorithm/DS, how it applies)
 * Level 3: Step-by-step approach (main steps in order, short pseudocode)
 * Level 4: Targeted implementation guidance (relevant code structure, key check)
 */
export function getLocalHintFallback(level, mode = "NORMAL", problemId = 1) {
  const problemHints = {
    1: {
      1: "Think about what information you need to remember while scanning the array. For each number, what other value are you looking for to reach the target?",
      2: "Use a hash map (`std::unordered_map<int, int>`). For each number `nums[i]`, check if its complement (`target - nums[i]`) already exists in the map.",
      3: "Step-by-step approach:\n1. Initialize `std::unordered_map<int, int> seen;`\n2. Loop `i` from 0 to `n - 1`:\n   - Calculate `complement = target - nums[i]`.\n   - If `seen.count(complement)`, return `{seen[complement], i}`.\n   - Otherwise, store `seen[nums[i]] = i;`",
      4: "Targeted snippet:\n```cpp\nint complement = target - nums[i];\nif (seen.find(complement) != seen.end()) {\n    return {seen[complement], i};\n}\nseen[nums[i]] = i;\n```\nInsert after checking so elements don't pair with themselves."
    },
    2: {
      1: "How is area calculated between two vertical lines? Width decreases as pointers move inward—how can you compensate for reduced width?",
      2: "Use the two-pointer technique starting at both ends (`left = 0`, `right = n - 1`). The water height is always limited by the shorter vertical bar.",
      3: "Step-by-step approach:\n1. Set `left = 0`, `right = n - 1`, `maxArea = 0`.\n2. While `left < right`:\n   - Compute `width = right - left` and `h = min(height[left], height[right])`.\n   - Update `maxArea = max(maxArea, width * h)`.\n   - Advance the pointer with the shorter bar.",
      4: "Targeted snippet:\n```cpp\nwhile (left < right) {\n    int h = min(height[left], height[right]);\n    maxArea = max(maxArea, h * (right - left));\n    if (height[left] < height[right]) left++;\n    else right--;\n}\n```"
    },
    3: {
      1: "How much rain water can be trapped above any single index `i`? It depends entirely on the minimum of the highest bar to its left and right minus its own height.",
      2: "Use two pointers moving inward (`left` and `right`) along with `left_max` and `right_max` to track the boundary heights without O(N) extra space.",
      3: "Step-by-step approach:\n1. Set `left = 0`, `right = n - 1`, `left_max = 0`, `right_max = 0`, `water = 0`.\n2. While `left < right`:\n   - If `height[left] < height[right]`, process `left`: update `left_max` and add trapped water, then `left++`.\n   - Otherwise, mirror logic for `right`: update `right_max` and add trapped water, then `right--`.",
      4: "Targeted snippet:\n```cpp\nif (height[left] < height[right]) {\n    if (height[left] >= left_max) left_max = height[left];\n    else water += left_max - height[left];\n    left++;\n} else {\n    if (height[right] >= right_max) right_max = height[right];\n    else water += right_max - height[right];\n    right--;\n}\n```"
    }
  };

  const selected = problemHints[problemId] || problemHints[1];
  return selected[level] || "You have reached the final hint level (4 of 4). Review your code and run it to verify!";
}
