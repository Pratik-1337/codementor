/**
 * ==============================================================================
 * CodeMentor - Backend Server (server/server.js)
 * ==============================================================================
 * 
 * Lightweight Node.js HTTP server for CodeMentor.
 * Built with standard Node.js libraries — zero npm dependencies required.
 * 
 * Key Responsibilities:
 * 1. Hosts the Local Ollama AI integration (qwen2.5-coder:7b) via server-side API.
 * 2. Never exposes Ollama port 11434 directly to the browser or internet tunnel.
 * 3. Provides POST /api/ai with request validation, rate limiting, and concurrency guards.
 * 4. Serves the static frontend (HTML, CSS, Vanilla JS) over HTTP from a single origin.
 * 5. Provides GET /api/health for diagnostic checks and viva demonstration.
 * ==============================================================================
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeInSandbox, evaluateSubmission } from "./judge.js";

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

export function getOllamaBaseUrl() {
  loadEnv();
  return (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

export function getOllamaModel() {
  loadEnv();
  return (process.env.OLLAMA_MODEL || "qwen2.5-coder:7b").trim();
}

export function getOllamaKeepAlive() {
  loadEnv();
  return (process.env.OLLAMA_KEEP_ALIVE || "15m").trim();
}

export function getPort() {
  loadEnv();
  return parseInt(process.env.PORT, 10) || 3000;
}

/**
 * Concurrency & Rate Limiting Controls
 * Since the site is hosted on a laptop CPU without dedicated GPU,
 * concurrency limiting protects the system from CPU exhaustion.
 */
const MAX_CONCURRENT_INFERENCES = 2;
let inFlightInferences = 0;

// Rate limiting: max 30 requests per minute per IP address
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const ipRateMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  let record = ipRateMap.get(ip);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, startTime: now };
    ipRateMap.set(ip, record);
    return false;
  }

  record.count += 1;
  return record.count > RATE_LIMIT_MAX_REQUESTS;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRateMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
      ipRateMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Checks connectivity to local Ollama server.
 */
async function checkOllamaConnectivity() {
  const baseUrl = getOllamaBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return { connected: false, models: [] };
    const data = await res.json().catch(() => ({}));
    const modelNames = Array.isArray(data.models) ? data.models.map(m => m.name || m.model) : [];
    return { connected: true, models: modelNames };
  } catch {
    return { connected: false, models: [] };
  }
}

/**
 * Fast deterministic greeting and acknowledgement detector.
 * Returns an instant response for unambiguous greetings, thanks, and farewells
 * without calling Ollama or invoking heavy AI pipelines.
 * Returns null if the message contains coding questions, problem references, etc.
 */
export function getFastGreetingResponse(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return null;
  const msg = rawMessage.trim().toLowerCase();
  // Strip common punctuation
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

  // Strip addressing words at the end
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
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\b(give|show|provide|send)\s+(me\s+)?(the\s+)?(full|complete|entire|whole)\s+(code|solution|program|cpp|implementation)\b/,
    /\b(full|complete|entire|whole)\s+(code|solution|program|implementation)\s*(please)?\b/,
    /\bshow\s+(me\s+)?(the\s+)?(solution|code)\b/,
    /\bi\s+(dont|don'?t|do\s+not)\s+want\s+hints?\b/,
    /\bno\s+hints?\b/,
    /\bjust\s+(give|show)\s+(me\s+)?(the\s+)?code\b/,
    /\bshow\s+full\s+code\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects whether the user is asking for code debugging or error correction.
 */
export function isDebuggingRequest(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\bwhat(\s*s|\s+is)?\s+wrong\b/,
    /\bhow\s+(do|can)\s+i\s+fix\s+(this|it|my code|the error|the bug|the issue)\b/,
    /\bhow\s+to\s+fix\s+(this|it|my code|the error|the bug|the issue)\b/,
    /\bfix\s+(my\s+|this\s+|the\s+)?(code|bug|error|issue|problem|solution)\b/,
    /\bwhy\s+(is|does)\s+(my\s+|this\s+)?(code|solution|program)\s+(failing|fail|not work|not working|broken|giving wrong)\b/,
    /\bwhy\s+(isnt|isn'?t|is not)\s+(it|my code|this)\s+working\b/,
    /\bwhere\s+is\s+(the|my)\s+(bug|mistake|error)\b/,
    /\bfind\s+(the|my)\s+(bug|mistake|error)\b/,
    /\bdebug\s+(my\s+|this\s+)?(code|program|solution)?\b/,
    /\bwhy\s+(am i getting|did i get|do i get)\s+(a\s+|an\s+)?(error|compile error|runtime error|wrong answer|wa|segfault|sigsegv)\b/,
    /\bwhy\s+(the\s+|this\s+|a\s+|an\s+)?(compile\s+error|runtime\s+error|compilation\s+error|error|wa|wrong\s+answer)\b/,
    /\b(compile|compilation|runtime)\s+error\b/,
    /\bwhy\s+(am i getting|do i get)\s+(wrong answer|wa)\b/,
    /\bcheck\s+(my\s+|this\s+)?code\s+for\s+(bugs|errors|mistakes)\b/,
    /\bhelp\s+(me\s+)?debug\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects general requests on how to solve or approach the problem.
 */
export function isHintOrApproachRequest(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\bhow\s+(do|can|should)\s+i\s+(solve|approach|start)\b/,
    /\bhow\s+to\s+(solve|approach|start)\b/,
    /\b(give|tell)\s+(me\s+)?(a\s+|another\s+|the\s+next\s+)?hints?\b/,
    /\bnext\s+hint\b/,
    /\banother\s+hint\b/,
    /\bmore\s+hints?\b/,
    /\bi\s+(am|m)\s+stuck\b/,
    /\bwhere\s+(do|should)\s+i\s+start\b/,
    /\bhow\s+does\s+one\s+solve\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects whether the user is explicitly requesting the next progressive hint.
 */
export function isNextHintRequest(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\b(give\s+me\s+)?(the\s+)?next\s+hint\b/,
    /\banother\s+hint\b/,
    /\bmore\s+hints?\b/,
    /\bnext\s+step\b/,
    /\bwhat\s+next\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects questions asking why a specific data structure or technique is used.
 */
export function isWhyQuestion(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\bwhy\s+(use\s+)?(a\s+|an\s+)?(hashmap|hash\s+map|unordered_map|map|set|unordered_set|two\s+pointers?|stack|queue|heap|vector)\b/,
    /\bwhy\s+is\s+(a\s+|an\s+)?(hashmap|hash\s+map|unordered_map|map|set|two\s+pointers?)\s+(useful|needed|better|used)\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects questions asking about Big-O time or space complexity.
 */
export function isComplexityQuestion(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\b(time|space)\s+complexity\b/,
    /\bwhat\s+is\s+(the\s+)?complexity\b/,
    /\bcomplexity\??$/,
    /\bbig\s*o\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects questions asking which data structure to use.
 */
export function isDataStructureQuestion(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\bwhat\s+(data\s+structure|ds)\b/,
    /\bwhich\s+(data\s+structure|ds)\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * Detects questions asking what a specific line of code does.
 */
export function isLineExplanationQuestion(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "string") return false;
  const msg = rawMessage.trim().toLowerCase();
  const cleaned = msg.replace(/['’]/g, "").replace(/[!?.,:;"~`]/g, " ").trim().replace(/\s+/g, " ");

  const patterns = [
    /\bwhat\s+does\s+this\s+line\s+do\b/,
    /\bexplain\s+this\s+line\b/,
    /\bwhat\s+does\s+line\s+\d+\s+do\b/
  ];

  return patterns.some(p => p.test(cleaned) || p.test(msg));
}

/**
 * System prompt instructing the AI to act as CodeMentor, an expert, concise C++ DSA mentor.
 */
function getSystemPrompt() {
  return `You are CodeMentor, an expert, concise C++ DSA mentor.

CORE PRINCIPLE — ANSWER ONLY WHAT THE USER ASKS:
- Answer ONLY the exact question asked. Do NOT volunteer unsolicited information.
- Keep responses strictly to 1–3 short sentences (unless the user explicitly requests a full solution).
- Do NOT add unsolicited explanations, alternative approaches, optimizations, complexity analysis, or examples.
- Do NOT repeat the problem statement, problem title, constraints, or summarize what the student already knows.
- Do NOT use conversational pleasantries, intros ("Sure!", "Here is..."), headings, or conclusions ("Hope this helps!").
- Use simple language and short, direct sentences.

RESPONSE LIMITS BY QUESTION TYPE:
1. "How do I solve this?" / General approach requests:
   - Provide ONLY ONE small conceptual nudge (1–2 sentences).
   - Do NOT reveal the algorithm name, data structure, pseudocode, or implementation code.
   - Example for Two Sum: "Can you use a data structure to remember numbers you've already visited?"

2. "Give me another hint" / Next hint requests:
   - Provide ONLY the next single hint level (1–2 sentences).
   - Progression: Level 1 (conceptual nudge) -> Level 2 (more specific direction) -> Level 3 (suggest data structure/algorithm) -> Level 4 (small targeted syntax/check guidance).
   - Example for Two Sum (Level 2): "A hashmap can store each number's index so you can check whether its complement has appeared."

3. Specific questions:
   - "What data structure should I use?": Name the data structure and briefly explain why (1–2 sentences).
   - "Why hashmap?" / "Why use [X]?": Explain why in 1–3 sentences only. Do NOT discuss complexity or the full algorithm.
   - "Time complexity?" / "What is the time complexity?": Give the Big-O time complexity and one short reason (1–2 sentences).
   - "What does this line do?": Explain only that line in 1–2 sentences.

4. Debugging & Error Correction ("What's wrong with my code?", "How do I fix this?"):
   - Identify the relevant error and state where to insert/replace the code.
   - Show ONLY the smallest necessary C++ line(s) in a \`\`\`cpp code block (1–3 lines).
   - Explain what the correction does in one short sentence.
   - Example:
     You use \`mp\` without declaring it. Add this inside your function:
     \`\`\`cpp
     unordered_map<int, int> mp;
     \`\`\`
     This creates the hashmap before you use it.
   - Do NOT rewrite or dump the entire program.
   - Adapt to the student's actual code; never assume a hashmap is missing unless the code supports that diagnosis.

5. Full Code ("Give me the full code", "Show full solution"):
   - If [FULL_CODE_CONSENT_GRANTED] is present, provide the complete, clean C++ solution.
   - Otherwise, ask: "I can guide you with progressive hints or show the complete C++ solution. Which would you prefer?"

FORMATTING:
- Format inline code and identifiers with Markdown backticks (e.g. \`mp\`, \`nums\`).
- Format code blocks with \`\`\`cpp.`;
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
 * Sends streaming or non-streaming chat request to local Ollama API.
 * Uses tuned options: num_ctx=2048, num_predict based on task, temperature=0.2.
 */
async function callOllama(messages, { stream = false, numPredict = 250, abortSignal = null } = {}) {
  const baseUrl = getOllamaBaseUrl();
  const model = getOllamaModel();
  const keepAlive = getOllamaKeepAlive();

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: Boolean(stream),
        keep_alive: keepAlive,
        options: {
          temperature: 0.2,
          num_predict: numPredict,
          num_ctx: 2048
        }
      }),
      signal: abortSignal || AbortSignal.timeout(90000)
    });

    if (response.status === 404) {
      return {
        error: `Ollama model '${model}' was not found. Please install it using 'ollama pull ${model}' in your terminal.`,
        status: 404
      };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`[Ollama Error] HTTP ${response.status}:`, errText);
      return {
        error: `Local Ollama error (HTTP ${response.status}). Please verify that '${model}' is ready.`,
        status: response.status
      };
    }

    if (stream) {
      return { streamBody: response.body, status: 200 };
    }

    const data = await response.json().catch(() => null);
    const rawContent = data?.message?.content || "";
    const cleanedText = cleanResponseText(rawContent);

    if (!cleanedText) {
      return {
        error: "AI Mentor returned an empty response. Please try rephrasing your question.",
        status: 502
      };
    }

    return { text: cleanedText, status: 200 };

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return {
        error: "AI Mentor request timed out while generating a response. The local CPU might be busy. Please try again.",
        status: 504
      };
    }

    console.error("[Ollama Connection Error]:", err.message);
    return {
      error: `Could not connect to Ollama at ${baseUrl}. Please make sure Ollama is running on your machine.`,
      status: 503
    };
  }
}

/**
 * Handles POST /api/ai
 */
async function handleAiRequest(req, res) {
  // 1. Rate limiting check
  const clientIp = req.headers["cf-connecting-ip"] || 
                   req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || 
                   req.socket.remoteAddress || 
                   "unknown";

  if (isRateLimited(clientIp)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending another AI request." }));
    return;
  }

  // 2. Request body reading with size guard (max 256 KB)
  let bodyStr = "";
  let bodyLength = 0;
  const MAX_PAYLOAD_BYTES = 256 * 1024;

  try {
    for await (const chunk of req) {
      bodyLength += chunk.length;
      if (bodyLength > MAX_PAYLOAD_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request payload too large (max 256 KB)." }));
        req.destroy();
        return;
      }
      bodyStr += chunk;
    }
  } catch (readErr) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to read request body." }));
    return;
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
    conversation = [],
    fullCodeConsent = false,
    stream = true
  } = payload;

  // 3. Fast Greeting / Acknowledgement Check: Return instantly without invoking Ollama or queuing
  if (requestType !== "hint" && message) {
    const fastReply = getFastGreetingResponse(message);
    if (fastReply) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ response: fastReply, fastPath: true }));
      return;
    }

    // 4. Full-Code Consent Check: If student asks for full code without prior consent
    if (isFullCodeRequest(message) && !fullCodeConsent) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        response: "I can guide you with progressive hints or show the complete C++ solution. Which would you prefer?",
        needsConsent: true
      }));
      return;
    }
  }

  // 5. Concurrency limiting check for actual Ollama inference
  if (inFlightInferences >= MAX_CONCURRENT_INFERENCES) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "AI Mentor is currently busy processing another request on this host. Please retry in a few seconds."
    }));
    return;
  }

  // Truncate fields to safe maximums to keep inference fast on laptop CPU
  const safeCode = (code || "").slice(0, 3500);
  const safeMessage = (message || "").slice(0, 1000);
  const safeTerminal = (terminalOutput || "").slice(0, 1000);

  const constraintsList = Array.isArray(problemConstraints) && problemConstraints.length > 0
    ? `\nConstraints:\n${problemConstraints.slice(0, 8).map(c => `- ${String(c).slice(0, 120)}`).join("\n")}`
    : "";

  const fullProblemText = problemTitle
    ? `Problem #${problemId}: ${problemTitle}\n\nStatement:\n${problemStatement.slice(0, 1200)}${constraintsList}`
    : (typeof problem === "object" ? JSON.stringify(problem).slice(0, 1200) : (String(problem || "C++ DSA Practice").slice(0, 1200)));

  // Build message list for Ollama chat
  const messages = [
    { role: "system", content: getSystemPrompt() },
    {
      role: "system",
      content: `[CURRENT WORKSPACE CONTEXT]
Language: ${language.toUpperCase()}
${fullProblemText}

Student's Current C++ Code (from Monaco Editor):
\`\`\`cpp
${safeCode || "// Editor is empty"}
\`\`\`

Latest Terminal Output:
\`\`\`text
${safeTerminal || "No terminal output yet."}
\`\`\`

Current Hint Mode: ${hintMode}${fullCodeConsent ? "\n[FULL_CODE_CONSENT_GRANTED]: True" : ""}`
    }
  ];

  // Include recent conversation history (last 4 turns to keep inference fast)
  if (Array.isArray(conversation)) {
    const recent = conversation.slice(-4);
    for (const msg of recent) {
      const text = msg.content || msg.text || "";
      if (typeof text === "string" && text.trim()) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: text.trim().slice(0, 350)
        });
      }
    }
  }

  // Handle Hint Request vs Debugging vs Ordinary Chat Message
  const isHint = requestType === "hint" || Boolean(hintLevel);
  const isDebug = !isHint && !fullCodeConsent && isDebuggingRequest(safeMessage);

  if (isHint) {
    const lvl = Math.min(Math.max(Number(hintLevel) || 1, 1), 4);
    let hintPrompt = `[PROGRESSIVE HINT REQUEST - LEVEL ${lvl} OF 4]
Hint Mode: ${hintMode}
Problem: #${problemId} - ${problemTitle}

Level ${lvl} Directive:
${lvl === 1 ? "- Level 1 (Conceptual nudge): Explain the core idea in 1–2 short sentences. Ask the student what to think about next. Do NOT provide code or mention specific data structures or algorithm names." : ""}
${lvl === 2 ? "- Level 2 (Specific direction): Give a more specific direction in 1–2 short sentences without giving code or the complete algorithm." : ""}
${lvl === 3 ? "- Level 3 (Data structure/algorithm): Suggest the relevant data structure or algorithmic technique and how it applies in 1–2 short sentences. Do NOT provide complete C++ code." : ""}
${lvl === 4 ? "- Level 4 (Targeted implementation guidance): Provide a small illustrative snippet (1–3 lines) for the key check/operation. Do NOT dump the complete program." : ""}`;

    if (Array.isArray(previousHints) && previousHints.length > 0) {
      hintPrompt += `\n\nPreviously given hints for this problem:
${previousHints.slice(0, 4).map((h, i) => `Hint ${i + 1}: ${String(h).slice(0, 200)}`).join("\n")}

STRICT RULE: Do NOT repeat previous hints. Provide fresh, deeper guidance for Level ${lvl}.`;
    }

    hintPrompt += `\n\nReturn ONLY the single hint for Level ${lvl} in 1–2 sentences. No intros, no pleasantries, no full code.`;

    messages.push({
      role: "user",
      content: hintPrompt
    });
  } else if (safeMessage) {
    let userPromptText = safeMessage.trim();
    if (fullCodeConsent) {
      userPromptText = `[FULL_CODE_CONSENT_GRANTED] The student has confirmed they want the complete C++ solution. Provide the complete, working, optimal C++ solution for Problem #${problemId} (${problemTitle}) with clear code and brief explanations.`;
    } else if (isDebug) {
      userPromptText = `${safeMessage.trim()}

[ACTIONABLE DEBUGGING INSTRUCTION]
Diagnose the student's code and terminal output.
Follow this exact 3-part format:
1. Identify the relevant error and state where to insert/replace the code (1 sentence).
2. Show ONLY the smallest necessary C++ correction in a \`\`\`cpp code block (1-3 lines).
3. Explain what the correction does in one short sentence.
Do NOT rewrite the entire program. Do NOT use numbered lists.
Never assume a hashmap is missing unless the submitted code supports that diagnosis.`;
    } else if (isNextHintRequest(safeMessage)) {
      const assistantTurns = (Array.isArray(conversation) ? conversation.filter(m => m.role === "assistant").length : 0);
      const hintCount = (Array.isArray(previousHints) ? previousHints.length : 0) + assistantTurns;
      const lvl = Math.min(Math.max(hintCount + 1, 2), 4);
      userPromptText = `${safeMessage.trim()}

[CONCISE HINT DIRECTIVE - LEVEL ${lvl} OF 4]
Provide ONLY the next single hint for Problem #${problemId} (${problemTitle}) in 1–2 short sentences.
${lvl === 2 ? "Give a more specific direction (e.g. mention that a hashmap can store numbers and indices). Do not reveal code or the full algorithm." : ""}
${lvl === 3 ? "Explain how the data structure or algorithm applies in 1–2 sentences. Do not provide complete code." : ""}
${lvl === 4 ? "Provide a small targeted illustrative snippet (1–3 lines). Do not dump the entire program." : ""}
Do not repeat previously given hints. Strictly 1–2 sentences. Zero filler, zero full code.`;
    } else if (isHintOrApproachRequest(safeMessage)) {
      userPromptText = `${safeMessage.trim()}

[CONCISE HINT DIRECTIVE - LEVEL 1 OF 4]
The student asked how to solve the problem.
Provide ONLY ONE small conceptual nudge in 1–2 short sentences.
Do NOT reveal the algorithm name, data structure, pseudocode, or implementation code.
Do NOT explain the entire approach. No intros, no filler.`;
    } else if (isWhyQuestion(safeMessage)) {
      userPromptText = `${safeMessage.trim()}

[CONCISE DIRECTIVE]
Answer ONLY why this data structure or technique is used in 1–3 short sentences.
Do NOT discuss time/space complexity, other data structures, or the full algorithm.`;
    } else if (isComplexityQuestion(safeMessage)) {
      userPromptText = `${safeMessage.trim()}

[CONCISE DIRECTIVE]
State the Big-O time complexity and one short reason in 1–2 sentences only.
Do NOT explain space complexity, the full algorithm, or code.`;
    } else if (isDataStructureQuestion(safeMessage)) {
      userPromptText = `${safeMessage.trim()}

[CONCISE DIRECTIVE]
Name the recommended data structure and briefly explain why in 1–2 sentences only.
Do not provide full code or algorithm explanation.`;
    } else if (isLineExplanationQuestion(safeMessage)) {
      userPromptText = `${safeMessage.trim()}

[CONCISE DIRECTIVE]
Explain ONLY that specific line in 1–2 short sentences.`;
    } else {
      userPromptText = `${safeMessage.trim()}

[CONCISE DIRECTIVE]
Answer ONLY the specific question asked in 1–3 short sentences.
Do NOT add unsolicited explanations, alternative approaches, optimizations, or complexity analysis.`;
    }

    messages.push({
      role: "user",
      content: userPromptText
    });
  }

  // Token limits enforcing concise generation
  let numPredict = 120; // 1-3 sentences default
  if (fullCodeConsent) {
    numPredict = 650;
  } else if (isDebug) {
    numPredict = 180;
  } else if (isHint) {
    numPredict = 120;
  }

  // If streaming is requested (default)
  if (stream) {
    inFlightInferences += 1;
    const abortController = new AbortController();
    req.on("close", () => {
      abortController.abort();
    });

    try {
      const result = await callOllama(messages, {
        stream: true,
        numPredict: numPredict,
        abortSignal: abortController.signal
      });

      if (result.error) {
        res.writeHead(result.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const reader = result.streamBody.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let insideThinkTag = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            const token = parsed?.message?.content || "";
            if (token) {
              if (token.includes("<think>")) {
                insideThinkTag = true;
                continue;
              }
              if (token.includes("</think>")) {
                insideThinkTag = false;
                continue;
              }
              if (insideThinkTag) continue;

              fullText += token;
              res.write(`data: ${JSON.stringify({ token: token })}\n\n`);
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }

      const cleaned = cleanResponseText(fullText);
      res.write(`data: ${JSON.stringify({ done: true, fullText: cleaned })}\n\n`);
      res.end();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[AI Stream Error]:", err.message);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Streaming error from AI Mentor." }));
        } else {
          res.write(`data: ${JSON.stringify({ error: "Connection interrupted." })}\n\n`);
          res.end();
        }
      }
    } finally {
      inFlightInferences = Math.max(0, inFlightInferences - 1);
    }
    return;
  }

  // Non-streaming fallback
  inFlightInferences += 1;
  try {
    const result = await callOllama(messages, {
      stream: false,
      numPredict: numPredict
    });

    if (result.error) {
      res.writeHead(result.status || 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ response: result.text }));
  } finally {
    inFlightInferences = Math.max(0, inFlightInferences - 1);
  }
}

/**
 * Handles POST /api/execute
 * Compiles and runs a single C++ program with optional stdin (Run Code feature).
 */
async function handleExecuteRequest(req, res) {
  let bodyStr = "";
  try {
    for await (const chunk of req) {
      bodyStr += chunk;
    }
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to read request body." }));
    return;
  }

  let payload = {};
  try {
    payload = JSON.parse(bodyStr || "{}");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON in request body." }));
    return;
  }

  const { code = "", stdin = "" } = payload;
  try {
    const result = await executeInSandbox(code, stdin);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("[Execute Handler Error]:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: false,
      isTLE: false,
      isApiError: true,
      compileError: "",
      stdout: "",
      stderr: `Execution Error: ${err.message}`,
      executionTime: "0.00",
      exitCode: "1",
      signal: ""
    }));
  }
}

/**
 * Handles POST /api/submit
 * Executes student C++ code separately against all 3 test cases for the problem.
 */
async function handleSubmitRequest(req, res) {
  let bodyStr = "";
  try {
    for await (const chunk of req) {
      bodyStr += chunk;
    }
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to read request body." }));
    return;
  }

  let payload = {};
  try {
    payload = JSON.parse(bodyStr || "{}");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON in request body." }));
    return;
  }

  const { problemId = 1, code = "" } = payload;
  try {
    const result = await evaluateSubmission(problemId, code);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("[Submit Handler Error]:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      verdict: "Execution/API Error",
      passedCount: 0,
      totalTests: 3,
      details: `Judging Error: ${err.message}`,
      executionTime: "0.00",
      testResults: []
    }));
  }
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
  let cleanPath = "/index.html";
  try {
    const rawPath = req.url.split("?")[0];
    cleanPath = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }

  if (cleanPath === "/" || cleanPath === "") {
    cleanPath = "/index.html";
  }

  // Security check: block access to environment, server internals, or hidden files
  if (
    cleanPath.startsWith("/.env") || 
    cleanPath.startsWith("/.git") || 
    cleanPath === "/package.json" ||
    cleanPath.startsWith("/server") ||
    cleanPath.startsWith("/scripts")
  ) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const safePath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.resolve(ROOT_DIR, "." + safePath);

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

    res.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * Creates the HTTP server handling API routes and static files.
 */
const server = http.createServer(async (req, res) => {
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
    const ollamaStatus = await checkOllamaConnectivity();
    const configuredModel = getOllamaModel();
    const modelFound = ollamaStatus.models.some(m => m === configuredModel || m.startsWith(`${configuredModel}:`));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      provider: "ollama",
      model: configuredModel,
      ollamaBaseUrl: getOllamaBaseUrl(),
      ollamaConnected: ollamaStatus.connected,
      modelInstalled: modelFound,
      activeInferences: inFlightInferences
    }));
    return;
  }

  // C++ Run Code execution endpoint
  if (urlPath === "/api/execute" && req.method === "POST") {
    handleExecuteRequest(req, res);
    return;
  }

  // C++ Submit test-suite evaluation endpoint (executes all 3 test cases)
  if (urlPath === "/api/submit" && req.method === "POST") {
    handleSubmitRequest(req, res);
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

const PORT = getPort();

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[Notice] Port ${PORT} is already in use by another process.`);
    console.error(`If another CodeMentor instance is running, stop it or change PORT in .env.\n`);
    process.exit(1);
  } else {
    console.error("[Server Error]", err.message);
    process.exit(1);
  }
});

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`CodeMentor Server running at: http://localhost:${PORT}`);
    console.log(`AI Provider: Local Ollama (${getOllamaModel()})`);
    console.log(`Ollama API Target: ${getOllamaBaseUrl()}`);
    console.log(`Serving frontend from: ${ROOT_DIR}`);
    console.log(`====================================================`);
  });
}

export default server;
