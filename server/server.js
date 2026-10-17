/**
 * ==============================================================================
 * CodeMentor - Backend Server (server/server.js)
 * ==============================================================================
 * 
 * Lightweight Node.js HTTP server for CodeMentor.
 * Built with standard Node.js libraries — zero npm dependencies required.
 * 
 * Key Responsibilities:
 * 1. Keeps OPENROUTER_API_KEY secure on the server (never exposed to browser).
 * 2. Provides POST /api/ai endpoint that injects workspace context into prompts.
 * 3. Serves the static frontend (HTML, CSS, Vanilla JS) over HTTP.
 * 4. Provides GET /api/health endpoint for quick diagnostics.
 * ==============================================================================
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

/**
 * Reads key-value pairs from .env into process.env.
 * Avoids needing third-party libraries like dotenv.
 */
export function loadEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;

  try {
    const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn("Notice: Could not parse .env file:", err.message);
  }
}

// Load environment variables at startup
loadEnv();

const PORT = process.env.PORT || 3000;

export function getApiKey() {
  loadEnv();
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

export function getModel() {
  loadEnv();
  return (process.env.OPENROUTER_MODEL || "openrouter/free").trim();
}

/**
 * System prompt instructing the AI to act as a Socratic DSA mentor.
 */
function getSystemPrompt() {
  return `You are CodeMentor, an expert C++ DSA (Data Structures and Algorithms) tutor.

ROLE & BEHAVIOR:
- Act strictly as a focused C++ DSA mentor, NOT a general-purpose conversational chatbot.
- Directly inspect the student's actual current C++ code and latest terminal diagnostics.
- Keep responses concise, accurate, and directly actionable. Avoid fluff.

RESPONSE CONCISENESS & LENGTH LIMITS:
- Keep normal responses around 40–80 words at most, usually shorter.
- "Help me": Provide ONE actionable hint, usually 1–2 short sentences.
- "What's wrong with my code?": Identify the single primary bug, explain it briefly, and suggest the smallest correction.
- Compiler errors / Runtime errors: Explain the root cause and the relevant fix directly.
- Complexity questions: Provide Time and Space complexity with a 1-sentence reason.
- Concept questions: Answer directly in 2–3 short sentences.
- Simple / direct questions: Answer directly without filler.
- Longer explanations or full solutions are ONLY acceptable when the user explicitly requests a detailed explanation or complete solution in ordinary chat.

STRICT AVOIDANCES:
- Never provide long intros ("Hello!", "Sure, I'd be happy to help...", "Great question!").
- Never provide conversational conclusions ("Hope this helps! Let me know if you need more help!").
- Never repeat or rephrase the user's question.
- Never use unnecessary headings or markdown decorations.
- Do not list multiple alternative solutions unless explicitly requested.
- Never rewrite or re-print the student's entire program; show only the minimal line or snippet needed for the fix.
- Avoid generic advice unrelated to the supplied code.

HINT MODES:
- HARD: Subtle conceptual clue. Do not reveal the algorithm, data structures, or code.
- NORMAL: Balanced directional guidance. Explain what to think about next without giving full code.
- EASY: More explicit explanation, relevant data structure/algorithm, and clear guidance.

PROGRESSIVE HINT LEVELS (1 to 5):
- Level 1: Conceptual nudge (What question should the student ask themselves? High-level intuition).
- Level 2: Specific direction (What state, variables, or invariants need to be tracked?).
- Level 3: Relevant algorithm or data structure (e.g. hash map lookup, two-pointer inward scan).
- Level 4: Step-by-step approach or concise pseudocode.
- Level 5: Detailed near-solution guidance, edge cases, and time/space complexity.

RULES FOR PROGRESSIVE HINTS:
- Progressive hints should normally be 1–3 short sentences, with more detail allowed at later levels (Levels 4 and 5).
- Return ONLY the current requested hint level.
- Each new hint MUST provide new, more specific information rather than repeating earlier hints.
- NEVER return all five hints in one response.
- NEVER provide the full code solution in a hint.`;
}

/**
 * Cleans response text, stripping internal thinking tags like <think>...</think>.
 */
function cleanResponseText(rawText) {
  if (!rawText) return "";
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (cleaned.startsWith("Thinking Process:")) {
    const parts = cleaned.split(/\n\n+/);
    if (parts.length > 1) cleaned = parts.slice(1).join("\n\n").trim();
  }
  return cleaned || rawText.trim();
}

/**
 * Sends chat request to OpenRouter API.
 */
async function callOpenRouter(messages) {
  const apiKey = getApiKey();
  const model = getModel();

  if (!apiKey || apiKey.includes("your_")) {
    return { error: "OPENROUTER_API_KEY is not configured in the server .env file.", status: 500 };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": `http://localhost:${PORT}`,
        "X-Title": "CodeMentor"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.4,
        max_tokens: 600
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.error) {
      const errMsg = data?.error?.message || data?.error || `HTTP ${response.status}`;
      console.warn(`[OpenRouter Error] Status: ${response.status}, Details:`, errMsg);

      if (response.status === 401 || response.status === 403) {
        return { error: "OpenRouter authentication failed. Please check your API key in .env.", status: 401 };
      }
      if (response.status === 429) {
        return { error: "OpenRouter rate limit reached. Please wait a moment and try again.", status: 429 };
      }
      return { error: `AI Mentor error: ${errMsg}`, status: response.status };
    }

    const rawContent = data.choices?.[0]?.message?.content || "";
    const cleanedText = cleanResponseText(rawContent);

    if (!cleanedText) {
      return { error: "AI Mentor returned an empty response. Please try asking again.", status: 502 };
    }

    return { text: cleanedText, status: 200 };
  } catch (err) {
    console.error("[OpenRouter Network Error]:", err.message);
    return { error: "Could not connect to OpenRouter. Check your internet connection.", status: 503 };
  }
}

/**
 * Handles POST /api/ai
 */
async function handleAiRequest(req, res) {
  let bodyStr = "";
  for await (const chunk of req) {
    bodyStr += chunk;
  }

  let payload = {};
  try {
    payload = JSON.parse(bodyStr || "{}");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON in request body." }));
    return;
  }

  const {
    requestType = "chat",
    problemId = 1,
    problemTitle = "",
    problemStatement = "",
    problemConstraints = [],
    problem = "",
    code = "",
    language = "cpp",
    terminalOutput = "",
    hintMode = "NORMAL",
    hintLevel = null,
    previousHints = [],
    message = "",
    conversation = []
  } = payload;

  const constraintsList = Array.isArray(problemConstraints) && problemConstraints.length > 0
    ? `\nConstraints:\n${problemConstraints.map(c => `- ${c}`).join("\n")}`
    : "";

  const fullProblemText = problemTitle
    ? `Problem #${problemId}: ${problemTitle}\n\nStatement:\n${problemStatement}${constraintsList}`
    : (typeof problem === "object" ? JSON.stringify(problem) : (problem || "C++ DSA Practice"));

  // Build message list for OpenRouter
  const messages = [
    { role: "system", content: getSystemPrompt() },
    {
      role: "system",
      content: `[CURRENT WORKSPACE CONTEXT]
Language: ${language.toUpperCase()}
${fullProblemText}

Student's Current C++ Code (from Monaco Editor):
\`\`\`cpp
${code || "// Editor is empty"}
\`\`\`

Latest Terminal Output:
\`\`\`text
${terminalOutput || "No terminal output yet."}
\`\`\`

Current Hint Mode: ${hintMode}`
    }
  ];

  // Include recent conversation history (last 8 turns)
  if (Array.isArray(conversation)) {
    const recent = conversation.slice(-8);
    for (const msg of recent) {
      const text = msg.content || msg.text || "";
      if (text.trim()) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: text.trim()
        });
      }
    }
  }

  // Handle Hint Request vs Ordinary Chat Message
  const isHint = requestType === "hint" || Boolean(hintLevel);

  if (isHint) {
    const lvl = hintLevel || 1;
    let hintPrompt = `[PROGRESSIVE HINT REQUEST - LEVEL ${lvl} OF 5]
Hint Mode: ${hintMode}
Problem: #${problemId} - ${problemTitle}

Level ${lvl} Directive:
${lvl === 1 ? "- Conceptual nudge. Ask a guiding question to steer student intuition without revealing algorithm." : ""}
${lvl === 2 ? "- Specific direction. Point out what state, variables, or invariants need tracking." : ""}
${lvl === 3 ? "- Relevant algorithm / data structure suitable for this problem (e.g. hash map, two pointers)." : ""}
${lvl === 4 ? "- Step-by-step approach or concise pseudocode." : ""}
${lvl === 5 ? "- Detailed near-solution guidance, edge cases, and time/space complexity." : ""}`;

    if (Array.isArray(previousHints) && previousHints.length > 0) {
      hintPrompt += `\n\nPreviously given hints for this problem:
${previousHints.map((h, i) => `Hint ${i + 1}: ${h}`).join("\n")}

STRICT RULE: Do NOT repeat the previous hints. Add genuinely new, deeper guidance for Level ${lvl}.`;
    }

    hintPrompt += `\n\nReturn ONLY the single hint for Level ${lvl}. Keep it concise (1–3 sentences). No introductions, no pleasantries, no complete code.`;

    messages.push({
      role: "user",
      content: hintPrompt
    });
  } else if (message) {
    messages.push({
      role: "user",
      content: message.trim()
    });
  }

  const result = await callOpenRouter(messages);

  if (result.error) {
    res.writeHead(result.status || 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: result.error }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ response: result.text }));
}

/**
 * MIME type mapping for static files.
 */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

/**
 * Serves static files safely from the project root.
 */
function serveStaticFile(req, res) {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/" || reqPath === "") {
    reqPath = "/index.html";
  }

  const filePath = path.join(ROOT_DIR, reqPath);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * Creates the HTTP server handling API routes and static files.
 */
const server = http.createServer((req, res) => {
  // CORS headers so frontend can connect smoothly
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split("?")[0].replace(/\/+$/, "");

  // Health check endpoint
  if (urlPath === "/api/health" && req.method === "GET") {
    const key = getApiKey();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      model: getModel(),
      apiKeyConfigured: Boolean(key && !key.includes("your_")),
      provider: "openrouter"
    }));
    return;
  }

  // AI chat & hint endpoint
  if (urlPath === "/api/ai" && req.method === "POST") {
    handleAiRequest(req, res);
    return;
  }

  // Static file delivery
  if (req.method === "GET") {
    serveStaticFile(req, res);
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`CodeMentor Server running at: http://localhost:${PORT}`);
  console.log(`AI Provider: OpenRouter (${getModel()})`);
  console.log(`Serving frontend from: ${ROOT_DIR}`);
  console.log(`====================================================`);
});
