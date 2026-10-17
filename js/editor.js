/**
 * ==============================================================================
 * CodeMentor - Monaco C++ Editor Controller (editor.js)
 * ==============================================================================
 * 
 * Manages the Monaco Editor instance configured strictly for C++.
 * Features:
 * - C++ syntax highlighting (language: "cpp")
 * - VS Code dark theme ("vs-dark")
 * - Line numbers, bracket matching, auto-indentation, code folding
 * - Code persistence in localStorage (codementor_code_cpp)
 * ==============================================================================
 */

// C++ Starter code template
export const STARTER_CPP_CODE = `#include <bits/stdc++.h>
using namespace std;

// Problem: Two Sum
// Given an array of integers nums and an integer target,
// return indices of the two numbers such that they add up to target.

vector<int> twoSum(vector<int>& nums, int target) {
    // Write your solution here:

    return {};
}

int main() {
    vector<int> nums = {2, 7, 11, 15};
    int target = 9;

    cout << "Input: nums = [2, 7, 11, 15], target = 9" << endl;
    vector<int> result = twoSum(nums, target);

    if (result.size() == 2) {
        cout << "Output: [" << result[0] << ", " << result[1] << "]" << endl;
    } else {
        cout << "Output: []" << endl;
    }

    return 0;
}`;

// Basic clean starter code
export const CLEAN_STARTER_CPP = `#include <bits/stdc++.h>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}`;

// Monaco editor instance & state
let editorInstance = null;
let pendingCode = null;
let codeChangeCallback = null;
let currentInitialCode = "";

/**
 * Returns whether the Monaco editor instance has finished loading.
 * @returns {boolean}
 */
export function isEditorReady() {
  return editorInstance !== null;
}

/**
 * Initializes the Monaco Editor for C++ inside the given DOM container.
 * 
 * @param {string} containerId - DOM container ID (e.g. "editorContainer")
 * @param {Function} onCodeChange - Callback triggered when code is typed
 * @param {string} [initialCode] - Problem-specific starter code or saved code
 */
export function initCppEditor(containerId, onCodeChange, initialCode = "") {
  codeChangeCallback = onCodeChange;
  currentInitialCode = initialCode;
  if (pendingCode === null && initialCode) {
    pendingCode = initialCode;
  }

  if (typeof require === "undefined") {
    console.error("Monaco loader (require.js) is not loaded.");
    return;
  }

  require.config({
    paths: {
      vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs"
    }
  });

  require(["vs/editor/editor.main"], function () {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Use pendingCode if set, otherwise initialCode, otherwise fallback to default starter
    const codeToUse = pendingCode !== null ? pendingCode : (initialCode || STARTER_CPP_CODE);
    pendingCode = null;

    // Configure Monaco exclusively for C++
    editorInstance = monaco.editor.create(container, {
      value: codeToUse,
      language: "cpp",
      theme: "vs-dark",
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      roundedSelection: true,
      tabSize: 4,
      folding: true,
      bracketPairColorization: { enabled: true }
    });

    console.log("Monaco C++ Editor initialized successfully.");

    // Listen to changes and notify callback
    editorInstance.onDidChangeModelContent(() => {
      const code = editorInstance.getValue();
      if (typeof codeChangeCallback === "function") {
        codeChangeCallback(code);
      }
    });
  });
}

/**
 * Returns current C++ source code from Monaco (or pending buffer if not initialized)
 * @returns {string}
 */
export function getCppCode() {
  if (!editorInstance) {
    if (pendingCode !== null) return pendingCode;
    return currentInitialCode || "";
  }
  return editorInstance.getValue();
}

/**
 * Updates the C++ code inside Monaco, or queues it if Monaco is not yet ready.
 * @param {string} newCode 
 */
export function setCppCode(newCode) {
  if (!editorInstance) {
    pendingCode = newCode;
    if (typeof codeChangeCallback === "function") {
      codeChangeCallback(newCode);
    }
    return;
  }
  editorInstance.setValue(newCode);
  editorInstance.setScrollTop(0);
  editorInstance.setPosition({ lineNumber: 1, column: 1 });
}

/**
 * Resets Monaco back to problem starter C++ code
 * @param {string} [starterCode]
 */
export function resetCppCode(starterCode = STARTER_CPP_CODE) {
  setCppCode(starterCode);
}
