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
    for (int i = 0; i < nums.size(); i++) {
        for (int j = i + 1; j < nums.size(); j++) {
            if (nums[i] + nums[j] == target) {
                return {i, j};
            }
        }
    }
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

// Monaco editor instance
let editorInstance = null;

/**
 * Initializes the Monaco Editor for C++ inside the given DOM container.
 * 
 * @param {string} containerId - DOM container ID (e.g. "editorContainer")
 * @param {Function} onCodeChange - Callback triggered when code is typed
 */
export function initCppEditor(containerId, onCodeChange) {
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

    // Load saved code from localStorage or default to runnable starter template
    const savedCode = localStorage.getItem("codementor_code_cpp");
    const initialCode = savedCode || STARTER_CPP_CODE;

    // Configure Monaco exclusively for C++
    editorInstance = monaco.editor.create(container, {
      value: initialCode,
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

    // Listen to changes and auto-save
    editorInstance.onDidChangeModelContent(() => {
      const code = editorInstance.getValue();
      localStorage.setItem("codementor_code_cpp", code);
      if (typeof onCodeChange === "function") {
        onCodeChange(code);
      }
    });
  });
}

/**
 * Returns current C++ source code from Monaco
 * @returns {string}
 */
export function getCppCode() {
  if (!editorInstance) return "";
  return editorInstance.getValue();
}

/**
 * Updates the C++ code inside Monaco
 * @param {string} newCode 
 */
export function setCppCode(newCode) {
  if (!editorInstance) return;
  editorInstance.setValue(newCode);
  localStorage.setItem("codementor_code_cpp", newCode);
}

/**
 * Resets Monaco back to initial starter C++ code
 */
export function resetCppCode() {
  setCppCode(STARTER_CPP_CODE);
}
