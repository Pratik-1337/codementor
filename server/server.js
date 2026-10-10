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
  return `You are CodeMentor, an expert DSA and C++ AI mentor helping a student learn and solve programming problems.

PEDAGOGICAL RULES:
- Guide the student to solve problems themselves through progressive Socratic guidance.
- ALWAYS analyze the student's actual current C++ code and latest terminal output.
- NEVER give away the complete solution code immediately unless repeatedly asked.

HINT MODES:
- HARD: Very small conceptual clue. Do not reveal the algorithm or data structure.
- NORMAL: Useful directional hint. Explain what to think about next. No full code.
- EASY: Detailed explanation. Algorithm or data structure explanation with pseudocode.

PROGRESSIVE HINT LEVELS (1 to 5):
- Level 1: Conceptual clue (What question should the student ask themselves?)
- Level 2: Specific direction (What state or values need to be tracked?)
- Level 3: Algorithm / Data Structure pattern (e.g. hash map lookup, two pointers)
- Level 4: Step-by-step logic and pseudocode
- Level 5: Near-solution guidance, edge cases, and time/space complexity

STRICT RULE FOR HINTS:
Return ONLY ONE single concise hint for the requested level. Do not dump multiple hint levels at once.`;
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
        max_tokens: 1000
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
    problem = "",
    code = "",
    language = "cpp",
    terminalOutput = "",
    hintMode = "NORMAL",
    hintLevel = null,
    message = "",
    conversation = []
  } = payload;

  // Build message list for OpenRouter
  const messages = [
    { role: "system", content: getSystemPrompt() },
    {
      role: "system",
      content: `[CURRENT WORKSPACE CONTEXT]
Language: ${language.toUpperCase()}
Problem: ${typeof problem === "object" ? JSON.stringify(problem) : problem}

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

  // Add the specific user prompt
  if (hintLevel) {
    messages.push({
      role: "user",
      content: `Please provide ONLY Hint Level ${hintLevel} (out of 5) for my current C++ code in ${hintMode} mode. Review earlier hints and provide a deeper hint. Return ONLY this single hint.`
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
