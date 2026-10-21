# CodeMentor 🚀 (Local AI Edition)
### *"Learn to solve. Don't just get the answer."*

A modern, web-based C++ Data Structures & Algorithms (DSA) learning and practice platform running **100% locally on your laptop** with **Ollama (`qwen2.5-coder:7b`)** and accessible anywhere over the internet via a free **Cloudflare Quick Tunnel**.

---

## 🌟 Key Highlights

- **100% Free & Zero Cloud AI Cost (₹0)**: Powered entirely by your local Ollama instance (`qwen2.5-coder:7b`). No OpenRouter API key, subscription, or paid cloud inference needed.
- **Hosted Entirely from Your Laptop**: Node.js serves the frontend application and AI API from a single unified server origin.
- **Accessible Over the Internet (Cloudflare Quick Tunnel)**: Generate a temporary, secure HTTPS public URL (`https://....trycloudflare.com`) in seconds without port forwarding, dynamic DNS, or firewall changes.
- **Socratic 5-Stage Progressive AI Hints**: Context-aware AI assistant that analyzes the student's actual live C++ code from Monaco Editor, terminal output, and provides one concise hint at a time across HARD, NORMAL, and EASY modes.
- **Real Remote C++ Execution (Wandbox GCC Head)**: Real compiler diagnostics, stdout, stderr, execution timing, and automated test cases. Completely independent from AI inference.
- **Secure Architecture**: Server-side isolation prevents external visitors or the browser from accessing Ollama's port 11434 directly. Includes request validation, concurrency throttling, and rate limiting.

---

## 📂 Project Structure

```text
CodeMentor Local/
├── .env                  # Server configuration (OLLAMA_MODEL, PORT) - Never committed
├── .env.example          # Template configuration file
├── .gitignore            # Ignores .env and OS/Node artifacts
├── package.json          # npm startup and management scripts
├── README.md             # Project documentation and viva guide
├── index.html            # Landing page
├── login.html            # User sign-in page
├── register.html         # User registration with live password checklist
├── forgot-password.html  # Password reset page (Firebase Auth)
├── dashboard.html        # Protected student dashboard & problem progress
├── problem.html          # 3-column C++ practice workspace (Problem | Editor & Terminal | AI Mentor)
├── css/
│   └── style.css         # Single unified dark theme stylesheet (VS Code / LeetCode inspired)
├── js/
│   ├── firebase-config.js # Firebase modular SDK initialization
│   ├── auth.js            # Shared auth helpers (error messages, password toggle, logout)
│   ├── register.js        # Registration form validation, password checklist, Firestore save
│   ├── login.js           # Login validation and Firebase sign-in
│   ├── forgot-password.js # Password reset request handler
│   ├── dashboard.js       # Dashboard session guard and Firestore profile loader
│   ├── workspace.js       # Workspace orchestrator (Monaco, Wandbox, Test suite, AI chat & hints)
│   ├── editor.js          # Monaco C++ editor setup, layout, and code persistence
│   ├── execution.js       # Real remote C++ compilation (Wandbox API) and test verdicts
│   ├── ai.js              # Frontend client for AI Mentor (/api/ai) and hints
│   └── problem.js         # Lightweight compatibility bridge to workspace.js
├── server/
│   └── server.js          # Zero-dependency Node.js HTTP server (serves frontend, guards Ollama)
└── scripts/
    ├── verify-ollama.ps1  # Verifies Ollama connectivity, qwen2.5-coder:7b, and inference
    ├── start-tunnel.ps1   # Launches Cloudflare Quick Tunnel against configured server port
    └── start-all.ps1      # Launches Ollama verification, Node.js server, and tunnel
```

---

## 🏛️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STUDENT BROWSER / DEVICE                          │
│        (Local: http://localhost:3001  OR  Public: https://...trycloudflare.com)│
│                                                                             │
│   [Landing / Auth]       [Protected Dashboard]       [Problem Workspace]    │
│  • index.html           • dashboard.html            • problem.html          │
│  • login.html             (Session Guard)            ├─ Problem Panel (26%) │
│  • register.html                                     ├─ Monaco Editor (48%) │
│  • forgot-password.html                              └─ AI Mentor (26%)     │
└──────────────┬────────────────────────┬─────────────────────┬───────────────┘
               │                        │                     │
               │ HTTPS                  │ HTTPS POST          │ HTTP / HTTPS
               ▼                        ▼                     ▼
    ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
    │   GOOGLE FIREBASE    │ │   WANDBOX SANDBOX    │ │  CLOUDFLARE TUNNEL   │
    │  • Authentication    │ │  • GCC Head Sandbox  │ │  (cloudflared QUIC)  │
    │  • Cloud Firestore   │ │  • Real stdout/err   │ └──────────┬───────────┘
    └──────────────────────┘ └──────────────────────┘            │
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │  LOCAL NODE.js SERVER│
                                                      │   (server/server.js) │
                                                      │ • Serves Web Assets  │
                                                      │ • /api/health Check  │
                                                      │ • Rate Limiting & CPU│
                                                      │   Concurrency Guard  │
                                                      └──────────┬───────────┘
                                                                 │ Local HTTP
                                                                 │ (Port 11434)
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │     LOCAL OLLAMA     │
                                                      │  • qwen2.5-coder:7b  │
                                                      │  • Keep-alive in RAM │
                                                      │  • Socratic DSA Logic│
                                                      └──────────────────────┘
```

---

## ⚙️ Prerequisites & Setup

### 1. Hardware & Operating System
- **OS**: Windows 11 (64-bit).
- **RAM**: 16 GB+ recommended (32 GB installed).
- **CPU**: Multi-core modern processor (Intel Core Ultra 9 or similar).

### 2. Required Software
1. **Node.js**: v18+ (tested on Node.js v25). [Download Node.js](https://nodejs.org/)
2. **Ollama**: Installed and running locally. [Download Ollama](https://ollama.ai/)
3. **Model**: `qwen2.5-coder:7b` downloaded in Ollama:
   ```powershell
   ollama pull qwen2.5-coder:7b
   ```
4. **Cloudflare `cloudflared`**:
   Install via Windows Package Manager (`winget`):
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
   *Or download manually from:* [Cloudflare Releases](https://github.com/cloudflare/cloudflared/releases/latest)

---

## 🔧 Environment Configuration (`.env`)

Create or review `.env` in the project root:

```env
# Local Ollama Server Base URL
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Installed Model Name
OLLAMA_MODEL=qwen2.5-coder:7b

# Duration to keep model loaded in RAM between student interactions
OLLAMA_KEEP_ALIVE=15m

# Node.js Server Port (Configured to 3001 so it runs alongside original CodeMentor on 3000)
PORT=3001
```

---

## 🚀 Running the Project (Step-by-Step)

### Step 1: Verify Ollama & Model
In Windows PowerShell:
```powershell
npm run verify:ollama
```
*or directly:*
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-ollama.ps1
```
This script checks:
- Ollama service responsiveness at `http://127.0.0.1:11434`
- Existence of `qwen2.5-coder:7b`
- Executes a live test prompt to ensure generation works.

---

### Step 2: Start the CodeMentor Node.js Server
In Windows PowerShell:
```powershell
npm start
```
The console will confirm:
```text
====================================================
CodeMentor Server running at: http://localhost:3001
AI Provider: Local Ollama (qwen2.5-coder:7b)
Ollama API Target: http://127.0.0.1:11434
Serving frontend from: D:\CodeMentor Local
====================================================
```

Verify in your browser:
- **Homepage**: [http://localhost:3001](http://localhost:3001)
- **Health Check**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

### Step 3: Start Cloudflare Quick Tunnel (For Public Access)
Open a **second PowerShell window** in the project directory and run:
```powershell
npm run tunnel
```
*or directly:*
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-tunnel.ps1
```
Cloudflare will output a public URL:
```text
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://greatly-collectors-suite-script.trycloudflare.com                                 |
+--------------------------------------------------------------------------------------------+
```

### Step 4: Share & Test From Any Device
1. Open the `https://....trycloudflare.com` URL on your phone, tablet, or another computer.
2. Sign in to your account.
3. Open Problem 1 (Two Sum), write code, run it, and click **Get Hint** or send a question in the **AI Mentor** chat.
4. The response is generated on your laptop by `qwen2.5-coder:7b` and streamed back over HTTPS.

---

## 🛡️ Security & Protection Mechanisms

Since the site is accessible from the public internet via Cloudflare Tunnel, several security controls are enforced:

1. **Strict Port Isolation**: Cloudflare tunnel forwards ONLY to `http://localhost:3001` (the Node.js web server). Port 11434 (Ollama) is **never** exposed to the internet.
2. **No Arbitrary Proxying**: The Node.js server does not proxy arbitrary URLs. Only strictly formatted requests to `/api/ai` are handled.
3. **Payload Size Guard**: Incoming POST payloads are capped at 256 KB. Oversized or abusive payloads are rejected with HTTP 413.
4. **Concurrency Guard**: Because inference runs on the laptop CPU without a dedicated GPU, in-flight inferences are capped at 2 simultaneous requests. Additional concurrent requests receive a polite HTTP 429 rather than freezing the host machine.
5. **Rate Limiting**: IP-based rate limiting (max 30 requests/minute) prevents flooding.
6. **Path Traversal & Secrets Protection**: Direct requests to `.env`, `.git`, `server/`, `scripts/`, or `package.json` are rejected with HTTP 403 Forbidden.
7. **Timeout Limits**: Ollama requests have a 90-second timeout guard with user-friendly error messages if the local CPU is under heavy load.
8. **Safe Markdown Rendering**: All AI responses pass through HTML character entity escaping (`&`, `<`, `>`, `"`, `'`) before markdown tags are parsed, preventing stored XSS or prompt injection attacks.

---

## 💡 How Progressive AI Hints Work

Standard AI assistants output the full solution immediately, hurting algorithmic learning. CodeMentor enforces a **5-Stage Progressive Hint System**:

- **Stage 1 (Conceptual Clue)**: Prompts the student with the fundamental question to ask.
- **Stage 2 (Directional Guidance)**: Advises what state, variables, or invariants need to be tracked.
- **Stage 3 (Algorithm & Data Structure)**: Identifies the algorithmic pattern (e.g., hash map complementary lookup).
- **Stage 4 (Pseudocode)**: Provides a high-level step-by-step logic structure without complete C++ code.
- **Stage 5 (Near-Solution Details)**: Pinpoints edge cases, off-by-one errors, and time/space complexity.

### Difficulty Modes
- **HARD**: Minimal, subtle clues. Will not reveal the algorithm or data structure.
- **NORMAL**: Directional guidance showing what to think about next.
- **EASY**: Detailed explanation with algorithmic strategy and complexity breakdown.

---

## ⚠️ Important Limitations & Viva Notes

Keep these operational facts in mind during your project demonstration:

1. **Host Laptop Must Stay Active**: The website, Node.js server, Ollama, and Cloudflare tunnel run directly on your laptop. If the laptop goes to sleep, restarts, or disconnects from Wi-Fi, the website and AI will become unreachable.
2. **Temporary Tunnel URLs**: Free Cloudflare Quick Tunnels generate a new, random subdomain each time `cloudflared` restarts. Never hardcode temporary URLs in permanent documentation.
3. **Local CPU Inference Speed**: Because the model runs on the Intel Core Ultra 9 CPU (no dedicated GPU), responses take approximately 4–10 seconds. This is normal and expected for local 7B-parameter LLM inference on CPU.
4. **Starter Code Reset Isolation**: Clicking the **Reset** button restores the problem's default C++ starter template in Monaco Editor and updates `localStorage`. It **never** calls the AI model.
5. **Separate Execution Service**: Clicking **Run Code** or **Submit** sends code to Wandbox GCC Head for real C++ compilation. It is completely independent from Ollama and does not trigger AI requests.

---

## 🎓 Viva Questions & Answers

### Q1: Why did you switch from cloud AI (OpenRouter) to local AI (Ollama)?
> *"Cloud AI introduces recurring API costs, external rate limits, and network latency. By migrating to local Ollama with `qwen2.5-coder:7b`, CodeMentor achieves ₹0 operating cost, complete student privacy, and allows the entire platform to function offline or be hosted directly from a personal computer."*

### Q2: How does Cloudflare Quick Tunnel expose a localhost port without port forwarding?
> *"Cloudflare Tunnel (`cloudflared`) establishes an outbound, encrypted QUIC/HTTP2 tunnel connection from the laptop to Cloudflare's nearest edge data center (e.g. Mumbai). When an external user visits the `trycloudflare.com` URL, Cloudflare's edge routes the request back through the existing outbound connection to our local Node.js port. This requires no router port forwarding, no static public IP, and no firewall inbound holes."*

### Q3: Why is Ollama not exposed directly through Cloudflare Tunnel?
> *"Ollama's API has no built-in authentication, authorization, or rate limiting. Exposing port 11434 directly would allow anyone on the internet to execute arbitrary model pulls, delete models, or exhaust the laptop's RAM and CPU. Our Node.js backend serves as a secure gateway that validates input, limits concurrency, enforces rate limits, and masks internal errors."*

### Q4: How does the progressive hint system ensure students don't jump straight to the solution?
> *"The frontend maintains the student's active hint level (1 to 5). When 'Next Hint' is clicked, the backend receives the problem context, previous hints already unlocked, and the requested level. The system prompt strictly constrains the AI to return only the single next progressive clue without repeating earlier hints or disclosing complete code solutions."*

### Q5: How is C++ code execution handled?
> *"C++ execution is completely separated from the AI. When the student clicks 'Run Code' or 'Submit', the C++ source is dispatched to Wandbox's sandbox API running GCC Head. Real compiler warnings, errors, stdout, and execution times are returned and verified against test cases."*
