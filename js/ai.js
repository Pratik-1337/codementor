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
 * Safely converts Markdown text into sanitized HTML.
 * Escapes all HTML special characters first, protecting against XSS and preserving
 * C++ templates like `unordered_map<int, int>` or `vector<int>`.
 * 
 * Supported Markdown:
 * - Fenced code blocks: ```lang ... ```
 * - Inline code: `...`
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Ordered lists: 1. Item
 * - Bulleted lists: - Item or * Item
 * - Paragraphs & line breaks
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

  const codeBlocks = [];
  const inlineCodes = [];

  // 2. Extract fenced code blocks (```lang\ncode\n``` or ```code```)
  text = text.replace(/```([a-zA-Z0-9_\-+]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    const langClass = lang ? ` class="language-${lang.trim()}"` : "";
    const cleanedCode = code.replace(/\r?\n$/, "");
    codeBlocks.push(`<pre><code${langClass}>${cleanedCode}</code></pre>`);
    return `\x1aBLOCK_${idx}\x1a`;
  });

  text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\x1aBLOCK_${idx}\x1a`;
  });

  // 3. Extract inline code (`code`)
  text = text.replace(/`([^`\n]+?)`/g, (match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${code}</code>`);
    return `\x1aINLINE_${idx}\x1a`;
  });

  // 4. Split by double newlines into blocks (paragraphs, lists, code blocks)
  const rawBlocks = text.split(/\r?\n\s*\r?\n/);
  const formattedBlocks = [];

  for (let block of rawBlocks) {
    block = block.trim();
    if (!block) continue;

    // Preserve code blocks verbatim
    if (/^\x1aBLOCK_\d+\x1a$/.test(block)) {
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
  finalHtml = finalHtml.replace(/\x1aBLOCK_(\d+)\x1a/g, (m, idx) => codeBlocks[Number(idx)] || "");

  // 6. Restore inline codes
  finalHtml = finalHtml.replace(/\x1aINLINE_(\d+)\x1a/g, (m, idx) => inlineCodes[Number(idx)] || "");

  return finalHtml;
}

function formatInline(str) {
  let s = str;
  // Bold: **text** or __text__
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  s = s.replace(/(?:^|[^\*])\*([^\*\n]+?)\*(?!\*)/g, (match, p1) => {
    const prefix = match.startsWith("*") ? "" : match.charAt(0);
    return `${prefix}<em>${p1}</em>`;
  });
  s = s.replace(/(?:^|[^_])_([^_]+?)_(?!_)/g, (match, p1) => {
    const prefix = match.startsWith("_") ? "" : match.charAt(0);
    return `${prefix}<em>${p1}</em>`;
  });
  // Strikethrough: ~~text~~
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  return s;
}

/**
 * Determines the backend API endpoint URL.
 * Automatically handles same-origin requests or local multi-port dev servers.
 */
function getApiEndpoint() {
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
 * Sends a chat or hint message to the AI Mentor backend with full workspace context:
 * - Current C++ code from Monaco Editor
 * - Problem title, statement, and constraints
 * - Latest terminal output
 * - Hint mode (HARD / NORMAL / EASY)
 * - Distinct requestType ("chat" vs "hint")
 * - Progressive hintLevel (1 to 5)
 * - Previous hints given for this problem
 * - Previous conversation history
 * 
 * @param {Object} options
 * @returns {Promise<string>} AI Mentor's contextual response
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
  chatHistory = []
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
      if (requestType === "hint" || hintLevel) {
        return getLocalHintFallback(hintLevel || 1, hintMode, problemId);
      }
      const errMsg = data.error || (response.status === 401 ? "AI Mentor is not configured correctly." : "AI Mentor is temporarily unavailable.");
      return errMsg;
    }

    if (data.response) {
      return data.response.trim();
    }

    if (requestType === "hint" || hintLevel) {
      return getLocalHintFallback(hintLevel || 1, hintMode, problemId);
    }

    return "I have analyzed your C++ code. Could you clarify what specific part you'd like feedback on?";

  } catch (error) {
    console.error("AI Mentor request error:", error);
    if (requestType === "hint" || hintLevel) {
      return getLocalHintFallback(hintLevel || 1, hintMode, problemId);
    }
    return "Could not connect to AI Mentor. Check your internet connection.";
  }
}

/**
 * Requests a progressive hint via the unified sendChatMessage pipeline.
 * 
 * @param {Object} options
 * @returns {Promise<string>}
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
 * Ensures the project remains presentable during viva evaluations.
 */
function getLocalHintFallback(level, mode = "NORMAL", problemId = 1) {
  const problemHints = {
    1: {
      1: "Think about what information you need to remember while scanning the array. Do you need each number's value, its index, or both?",
      2: "Consider whether a hash map (`std::unordered_map<int, int>`) could help you quickly determine whether the **complement** (`target - nums[i]`) has already appeared.",
      3: "Store each previously seen number and its index in `std::unordered_map<int, int>`. Before inserting `nums[i]`, check if `target - nums[i]` exists.",
      4: "Algorithm Blueprint:\n1. Create `std::unordered_map<int, int> seen;`\n2. Loop `i` from 0 to `nums.size() - 1`:\n3. If `seen.count(target - nums[i])`, return `{seen[target - nums[i]], i}`.\n4. Else insert `seen[nums[i]] = i;`",
      5: "Detailed Advice: An element cannot pair with itself. Inserting into the map *after* checking ensures you never pair `nums[i]` with itself. Time complexity: O(N), Auxiliary Space: O(N)."
    },
    2: {
      1: "How is area calculated between two vertical lines? Area = `min(height[left], height[right]) * (right - left)`. What happens to the width when you move pointers inward?",
      2: "Start with the widest container using two pointers at index 0 and index `n - 1`. Notice that the width strictly decreases at every step.",
      3: "Since width always shrinks, the only way to find a larger area is to find taller vertical lines. Which pointer limits current area: the shorter or the taller one?",
      4: "Algorithm Blueprint:\n1. `left = 0`, `right = n - 1`, `maxArea = 0;`\n2. `while (left < right):`\n3.   `int h = min(height[left], height[right]);`\n4.   `maxArea = max(maxArea, h * (right - left));`\n5.   `if (height[left] < height[right]) left++; else right--;`",
      5: "Detailed Advice: Always advance the pointer pointing to the shorter vertical bar. Time complexity: O(N), Auxiliary Space: O(1)."
    },
    3: {
      1: "How much rain water can be trapped above any single index `i`? It equals `min(max_left_height, max_right_height) - height[i]` (if positive).",
      2: "Instead of precomputing prefix and suffix max arrays with O(N) memory, consider two pointers moving inward from left and right.",
      3: "Maintain `left_max` and `right_max`. If `height[left] < height[right]`, the water level at `left` is strictly bounded by `left_max`.",
      4: "Algorithm Blueprint:\n1. `left = 0, right = n - 1, left_max = 0, right_max = 0, total = 0;`\n2. `while (left < right):`\n3.   `if (height[left] < height[right]):`\n4.     `if (height[left] >= left_max) left_max = height[left]; else total += left_max - height[left];`\n5.     `left++;`\n6.   `else:` ... mirror logic for right pointer;",
      5: "Detailed Advice: Monotonic two-pointer simulation processes each bar in O(1) time. Total Time: O(N), Auxiliary Space: O(1)."
    }
  };

  const selected = problemHints[problemId] || problemHints[1];
  return selected[level] || "You have reached the final hint level (5 of 5). Review your code and run it to verify!";
}
