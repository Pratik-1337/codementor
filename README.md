# CodeMentor 🚀
### *"Learn to solve. Don't just get the answer."*

A modern, web-based C++ Data Structures & Algorithms (DSA) learning and practice platform built for a Computer Science mini-project.

Unlike standard chatbots that output complete solutions immediately and harm algorithmic thinking, **CodeMentor** provides:
1. **Interactive C++ Monaco Workspace**: In-browser C++ editor with real remote compilation via Wandbox (GCC 14), custom `stdin` support, and automated test-case evaluation.
2. **Progressive AI Mentor**: Context-aware AI assistant powered by OpenRouter that inspects the student's actual code and runtime diagnostics, offering 5 progressive hint levels across HARD, NORMAL, and EASY modes.
3. **Secure Authentication & Profiles**: Email/Password authentication and user profiles powered by Google Firebase (Authentication & Cloud Firestore).

---

## 📂 Final Project Folder Structure

```text
CodeMentor/
├── .env                  # Server secrets (OPENROUTER_API_KEY, PORT) - Never committed
├── .env.example          # Environment variables template
├── .gitignore            # Ignores .env and OS/Node artifacts
├── index.html            # Landing page introducing the platform
├── login.html            # User sign-in page
├── register.html         # User registration with live password checklist & strength meter
├── forgot-password.html  # Password reset page (Firebase Auth email trigger)
├── dashboard.html        # Protected student dashboard & profile
├── problem.html          # 3-column C++ practice workspace (Problem | Editor & Terminal | AI Mentor)
├── package.json          # Node scripts ("start" / "dev")
├── README.md             # Project documentation and viva guide
├── css/
│   └── style.css         # Single unified stylesheet (VS Code / GitHub Dark theme)
├── js/
│   ├── firebase-config.js # Firebase app, auth, and Firestore initialization
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
└── server/
    └── server.js          # Zero-dependency Node.js HTTP server (serves frontend & protects API key)
```

---

## 🛠️ Technologies Used

| Technology | Role & Purpose |
| :--- | :--- |
| **HTML5 & Vanilla CSS3** | Semantic markup and responsive dark UI inspired by VS Code and LeetCode. Zero heavy CSS frameworks. |
| **Vanilla JavaScript (ES Modules)** | Pure modern JavaScript with native `import`/`export` and `async`/`await`. Zero build tools or bundle steps. |
| **Monaco Editor** | The in-browser code editor powering VS Code. Pre-configured strictly for C++ with syntax highlighting and auto-save. |
| **Google Firebase Authentication** | Manages user registration, secure session tokens, password hashing, and login/logout. |
| **Cloud Firestore** | NoSQL database storing user metadata (`fullName`, `username`, `email`, `createdAt`) linked to user UID. |
| **Wandbox Remote Sandbox** | External REST API (`wandbox.org`) that compiles and runs C++ code with GCC 14, returning real stdout, stderr, and execution time. |
| **OpenRouter API** | Cloud AI gateway granting access to LLM models for intelligent, Socratic coding mentorship. |
| **Node.js HTTP Server** | Lightweight backend server (built with standard `node:http`). Serves static files and keeps the OpenRouter API key hidden from the client browser. |

---

## 🏛️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER FRONTEND                                │
│                                                                             │
│   [Auth Pages]           [Protected Dashboard]       [Problem Workspace]    │
│  • login.html           • dashboard.html            • problem.html          │
│  • register.html          (Session Guard)            ├─ Problem Panel (26%) │
│  • forgot-password.html                              ├─ Monaco Editor (48%) │
│                                                      └─ AI Mentor (26%)     │
└──────────────┬────────────────────────┬─────────────────────┬───────────────┘
               │                        │                     │
               ▼                        ▼                     ▼
    ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
    │   GOOGLE FIREBASE    │ │   WANDBOX SANDBOX    │ │   LOCAL NODE SERVER  │
    │  • Authentication    │ │  • GCC 14 Sandbox    │ │     (server.js)      │
    │  • Cloud Firestore   │ │  • Real stdout/err   │ │  • Serves Web App    │
    │                      │ │  • Test Cases        │ │  • Reads .env Secret │
    └──────────────────────┘ └──────────────────────┘ └──────────┬───────────┘
                                                                 │
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │   OPENROUTER AI      │
                                                      │  • Socratic Mentor   │
                                                      │  • Progressive Hints │
                                                      └──────────────────────┘
```

---

## ⚙️ Setup & Configuration

### 1. Prerequisites
- **Node.js** (v18 or higher installed).
- A modern web browser (Chrome, Edge, Firefox, or Brave).

### 2. Configure OpenRouter AI
1. Obtain a free API key from [OpenRouter](https://openrouter.ai/keys).
2. Create or verify your `.env` file in the project root:
   ```env
   OPENROUTER_API_KEY=your_actual_openrouter_api_key_here
   OPENROUTER_MODEL=openrouter/free
   PORT=3000
   ```
   *(The template `.env.example` is also provided in the repository).*

### 3. Configure Firebase
Firebase credentials are pre-configured in [`js/firebase-config.js`](js/firebase-config.js).
If you wish to use your own Firebase project:
1. Open the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Enable **Email/Password** under **Authentication > Sign-in method**.
3. Create a **Cloud Firestore Database** in test mode.
4. Copy your Web App configuration snippet and paste it into [`js/firebase-config.js`](js/firebase-config.js):
   ```javascript
   export const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT.appspot.com",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

---

## 💻 How to Run the Project Locally

Because the project uses modern ES Modules and a secure AI proxy, run it using the built-in Node.js server:

```bash
npm start
```
*or*
```bash
npm run dev
```

Then open your browser at:
```text
http://localhost:3000
```

---

## ⚡ How Real C++ Execution Works

1. **Monaco C++ Editor**: The student writes C++ code in the browser. Code is automatically mirrored to `localStorage` under `codementor_code_cpp` so progress is never lost on refresh.
2. **Compilation Request**: When clicking **Run Code**, [`js/execution.js`](js/execution.js) packages the source code and any custom `stdin` into a POST request to `https://wandbox.org/api/compile.json` with compiler `gcc-head`.
3. **Terminal Display**: The remote output is returned directly to the browser:
   - Compilation errors (`compileError`)
   - Runtime errors (`stderr`)
   - Standard output (`stdout`)
   - Execution time (`executionTime` in seconds)
4. **Test Suite Submission**: When clicking **Submit**, [`js/execution.js`](js/execution.js) executes the code against predefined test cases and returns a clear verdict: `Accepted`, `Wrong Answer`, `Time Limit Exceeded`, `Compilation Error`, or `Runtime Error`.

---

## 💡 How Progressive AI Hints Work

Standard AI chatbots output full code solutions instantly, preventing algorithmic intuition. CodeMentor introduces a **5-Stage Progressive Hint System**:

- **Stage 1 (Conceptual Clue)**: Prompts the student with the fundamental question to ask.
- **Stage 2 (Directional Guidance)**: Advises what state or values need to be tracked.
- **Stage 3 (Algorithm & Data Structure)**: Identifies the algorithmic pattern (e.g., hash map complementary lookup).
- **Stage 4 (Pseudocode)**: Provides a high-level step-by-step logic structure without C++ code.
- **Stage 5 (Near-Solution Details)**: Pinpoints edge cases, off-by-one errors, and time/space complexity.

### Difficulty Modes
- **HARD**: Minimal, subtle clues. Will not reveal the algorithm or data structure.
- **NORMAL**: Directional guidance showing what to think about next.
- **EASY**: Detailed explanation with pseudocode and complexity breakdown.

---

## 🎓 College Viva & Presentation Cheat Sheet

Be ready to explain these six core workflows during your viva:

### 1. How a user registers and logs in
- **Register (`register.js`)**: Real-time validation checks for 8+ chars, uppercase, number, and special character. On submission, `createUserWithEmailAndPassword(auth, email, password)` creates the user in Firebase Auth. `updateProfile()` sets the `displayName`, and `setDoc()` saves metadata (`fullName`, `username`, `email`, `createdAt`) to Firestore collection `users/{uid}`. Passwords are never saved in Firestore.
- **Login (`login.js`)**: `signInWithEmailAndPassword(auth, email, password)` validates credentials against Firebase Auth and redirects to `dashboard.html`.

### 2. How Firebase protects the dashboard & workspace
- **Session Guard (`dashboard.js`, `workspace.js`)**: On page load, `onAuthStateChanged(auth, (user) => { ... })` checks for an active session. If `!user`, it immediately redirects to `login.html`. Only after authentication is verified does it fetch the Firestore profile and reveal the page.

### 3. How the C++ editor compiles and runs code
- **Execution Service (`execution.js`)**: The code in Monaco is extracted via `getCppCode()` and sent via HTTPS POST to the Wandbox sandbox API (`https://wandbox.org/api/compile.json`). Wandbox compiles the code with GCC 14 on an isolated server and returns compiler errors, stdout, and execution duration.

### 4. How the AI receives the student's current code
- When the student asks a question or clicks "Get Hint", `workspace.js` captures:
  1. The student's live C++ code from Monaco Editor.
  2. The problem title and statement.
  3. The latest terminal output and diagnostics.
  4. The selected hint mode and level.
  5. Recent chat history.
- These are sent to `/api/ai`. The server embeds them into the system prompt so the AI acts as a mentor analyzing their actual logic rather than giving generic answers.

### 5. How the progressive hint system works
- The student starts at Hint Level 1. Only **one single hint** is revealed at a time to prevent solution dumping.
- Clicking **Next Hint** increments `currentHintLevel` (up to 5). The backend receives the current level and past hints, generating a deeper level of guidance calibrated by the selected mode (HARD, NORMAL, or EASY).

### 6. How the backend keeps the OpenRouter API key secret
- If the browser contacted OpenRouter directly, the API key would be visible in browser Network tabs and source code.
- Instead, the browser calls our local Node.js endpoint `POST /api/ai`.
- The Node.js server reads `OPENROUTER_API_KEY` from the private `.env` file on disk. The server attaches the key in its own HTTPS request to OpenRouter and returns only the AI text to the browser.
