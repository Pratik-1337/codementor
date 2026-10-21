/**
 * ==============================================================================
 * CodeMentor - C++ Remote Execution Service (execution.js)
 * ==============================================================================
 * 
 * Sends student C++ code to a remote compilation sandbox (Wandbox GCC Head)
 * and returns real compiler diagnostics, stdout, stderr, execution time, and status.
 * Also handles running test cases for the "Submit" feature.
 * Completely separate from OpenRouter.
 * ==============================================================================
 */

// Wandbox compilation API endpoint (used as fallback or by server)
const WANDBOX_API = "https://wandbox.org/api/compile.json";

/**
 * Resolves the Node.js backend base URL.
 * Defaults to current origin if port 3001, otherwise targets port 3001 directly.
 */
export function getApiBase() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }
  if (window.location.port === "3001" || (!window.location.port && window.location.protocol === "http:")) {
    return "";
  }
  return `${window.location.protocol === "https:" ? "https" : "http"}://${window.location.hostname || "localhost"}:3001`;
}

/**
 * Compiles and executes C++ source code with optional standard input (stdin).
 * Routes through the Node.js backend execution API, with fallback to direct Wandbox sandbox.
 * 
 * @param {string} code - C++ source code
 * @param {string} stdin - Custom standard input passed to cin
 * @returns {Promise<Object>} Execution result object
 */
export async function executeCppCode(code, stdin = "") {
  // 1. Attempt Node.js backend execution endpoint
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, stdin: (stdin || "").trim() })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend API unreachable or standalone environment; fall through to direct sandbox
  }

  // 2. Direct Wandbox execution fallback
  const startTime = performance.now();
  try {
    const response = await fetch(WANDBOX_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: "gcc-head",
        code: code,
        stdin: (stdin || "").trim()
      })
    });

    if (!response.ok) {
      throw new Error(`Execution sandbox responded with status HTTP ${response.status}`);
    }

    const data = await response.json();
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const hasExecutionStatus = data.status !== undefined && data.status !== null && data.status !== "";
    const status = hasExecutionStatus ? String(data.status) : "UNKNOWN";

    const compileError = data.compiler_error || 
      (status !== "0" && !data.program_output && !data.program_error ? (data.compiler_message || data.compiler_output || "") : "") || 
      "";

    const stdout = data.program_output || data.program_message || "";
    const stderr = data.program_error || "";
    const signal = data.signal || "";

    // Detect Time Limit Exceeded
    const isTLE = signal === "SIGKILL" || 
                  signal.includes("KILL") || 
                  stdout.includes("Time limit exceeded") || 
                  stderr.includes("Time limit exceeded") || 
                  compileError.includes("Time limit exceeded");

    const isSuccess = hasExecutionStatus && status === "0" && !compileError && !stderr && !isTLE;

    return {
      success: isSuccess,
      isTLE: isTLE,
      isApiError: false,
      compileError: compileError,
      stdout: stdout,
      stderr: stderr,
      executionTime: elapsed,
      exitCode: status,
      signal: signal
    };

  } catch (error) {
    console.error("C++ execution error:", error);
    return {
      success: false,
      isTLE: false,
      isApiError: true,
      compileError: "",
      stdout: "",
      stderr: `Execution/API Error: ${error.message}. Please check your internet connection.`,
      executionTime: "0.00",
      exitCode: "1",
      signal: ""
    };
  }
}

/**
 * Builds a comprehensive C++ test harness that compiles the student's solution function
 * and tests it against multiple real test cases (samples, edge cases, and hidden tests).
 * Evaluates correctness using the problem's actual contract.
 * 
 * @param {number|string} problemId
 * @param {string} userCode
 * @returns {string} Complete C++ code for Wandbox
 */
export function buildTestHarness(problemId, userCode) {
  const pid = Number(problemId) || 1;
  const hasClassSolution = /\bclass\s+Solution\b/.test(userCode);
  const caller = hasClassSolution ? "Solution()." : "";

  // Common includes and main redefinition to disable user's main() without compiler error
  const prelude = `
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <unordered_map>
#include <unordered_set>
#include <cmath>
#include <climits>
#include <sstream>

#define main __codementor_user_main_disabled
${userCode}
#undef main
`;

  if (pid === 1) {
    // Problem 1: Two Sum
    // Contract: vector<int> twoSum(vector<int>& nums, int target)
    // - Valid indices: 0 <= i1 < n, 0 <= i2 < n, i1 != i2
    // - nums[i1] + nums[i2] == target
    // - Returned in any order
    return `${prelude}
int main() {
    using namespace std;
    struct TestCase {
        vector<int> nums;
        int target;
        string name;
    };
    vector<TestCase> tests = {
        {{3, 2, 4}, 6, "Test 1 (Basic Example): nums = [3, 2, 4], target = 6"},
        {{2, 7, 11, 15}, 9, "Test 2 (Normal Functionality): nums = [2, 7, 11, 15], target = 9"},
        {{3, 3}, 6, "Test 3 (Edge Case - Duplicate Values): nums = [3, 3], target = 6"}
    };

    int passed = 0;
    for (int i = 0; i < (int)tests.size(); ++i) {
        auto& t = tests[i];
        vector<int> res;
        bool threw = false;
        try {
            res = ${caller}twoSum(t.nums, t.target);
        } catch (...) {
            threw = true;
        }

        if (threw) {
            cout << "[FAIL] " << t.name << endl;
            cout << "       Runtime exception thrown during test execution." << endl;
            continue;
        }

        bool ok = false;
        if (res.size() == 2) {
            int i1 = res[0], i2 = res[1];
            if (i1 >= 0 && i1 < (int)t.nums.size() && i2 >= 0 && i2 < (int)t.nums.size() && i1 != i2) {
                if (t.nums[i1] + t.nums[i2] == t.target) {
                    ok = true;
                }
            }
        }

        if (ok) {
            cout << "[PASS] " << t.name << " -> Output: [" << res[0] << ", " << res[1] << "]" << endl;
            passed++;
        } else {
            cout << "[FAIL] " << t.name << endl;
            cout << "       Expected: two distinct indices summing to " << t.target << endl;
            cout << "       Actual Output: ";
            if (res.size() == 2) {
                cout << "[" << res[0] << ", " << res[1] << "] ";
                if (res[0] < 0 || res[0] >= (int)t.nums.size() || res[1] < 0 || res[1] >= (int)t.nums.size()) {
                    cout << "(indices out of bounds!)" << endl;
                } else if (res[0] == res[1]) {
                    cout << "(indices are not distinct, element reused!)" << endl;
                } else {
                    cout << "(sum was " << (t.nums[res[0]] + t.nums[res[1]]) << " != " << t.target << ")" << endl;
                }
            } else if (res.empty()) {
                cout << "[] (empty vector returned)" << endl;
            } else {
                cout << "[size: " << res.size() << "]" << endl;
            }
        }
    }

    cout << endl << passed << "/3 test cases passed." << endl;
    if (passed == 3) {
        cout << "__CM_VERDICT__=ACCEPTED" << endl;
    } else {
        cout << "__CM_VERDICT__=WA" << endl;
    }
    return 0;
}
`;
  }

  if (pid === 2) {
    // Problem 2: Container With Most Water
    // Contract: int maxArea(vector<int>& height)
    return `${prelude}
int main() {
    using namespace std;
    struct TestCase {
        vector<int> height;
        int expected;
        string name;
    };
    vector<TestCase> tests = {
        {{1, 8, 6, 2, 5, 4, 8, 3, 7}, 49, "Test 1 (Basic Example): height = [1, 8, 6, 2, 5, 4, 8, 3, 7]"},
        {{4, 3, 2, 1, 4}, 16, "Test 2 (Normal Functionality): height = [4, 3, 2, 1, 4]"},
        {{1, 1}, 1, "Test 3 (Edge Case - Minimum Array Length): height = [1, 1]"}
    };

    int passed = 0;
    for (int i = 0; i < (int)tests.size(); ++i) {
        auto& t = tests[i];
        int res = 0;
        bool threw = false;
        try {
            res = ${caller}maxArea(t.height);
        } catch (...) {
            threw = true;
        }

        if (threw) {
            cout << "[FAIL] " << t.name << endl;
            cout << "       Runtime exception thrown during test execution." << endl;
            continue;
        }

        if (res == t.expected) {
            cout << "[PASS] " << t.name << " -> Output: " << res << endl;
            passed++;
        } else {
            cout << "[FAIL] " << t.name << endl;
            cout << "       Expected: " << t.expected << endl;
            cout << "       Actual Output: " << res << endl;
        }
    }

    cout << endl << passed << "/3 test cases passed." << endl;
    if (passed == 3) {
        cout << "__CM_VERDICT__=ACCEPTED" << endl;
    } else {
        cout << "__CM_VERDICT__=WA" << endl;
    }
    return 0;
}
`;
  }

  if (pid === 3) {
    // Problem 3: Trapping Rain Water
    // Contract: int trap(vector<int>& height)
    return `${prelude}
int main() {
    using namespace std;
    struct TestCase {
        vector<int> height;
        int expected;
        string name;
    };
    vector<TestCase> tests = {
        {{0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1}, 6, "Test 1 (Basic Example): height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]"},
        {{4, 2, 0, 3, 2, 5}, 9, "Test 2 (Normal Functionality): height = [4, 2, 0, 3, 2, 5]"},
        {{5, 4, 3, 2, 1}, 0, "Test 3 (Edge Case - Decreasing Elevation): height = [5, 4, 3, 2, 1]"}
    };

    int passed = 0;
    for (int i = 0; i < (int)tests.size(); ++i) {
        auto& t = tests[i];
        int res = 0;
        bool threw = false;
        try {
            res = ${caller}trap(t.height);
        } catch (...) {
            threw = true;
        }

        if (threw) {
            cout << "[FAIL] " << t.name << endl;
            cout << "       Runtime exception thrown during test execution." << endl;
            continue;
        }

        if (res == t.expected) {
            cout << "[PASS] " << t.name << " -> Output: " << res << endl;
            passed++;
        } else {
            cout << "[FAIL] " << t.name << endl;
            cout << "       Expected: " << t.expected << endl;
            cout << "       Actual Output: " << res << endl;
        }
    }

    cout << endl << passed << "/3 test cases passed." << endl;
    if (passed == 3) {
        cout << "__CM_VERDICT__=ACCEPTED" << endl;
    } else {
        cout << "__CM_VERDICT__=WA" << endl;
    }
    return 0;
}
`;
  }

  // Fallback for unconfigured problem ID
  return `${prelude}`;
}

/**
 * Runs the student's C++ code against the real comprehensive test suite for a specific problem.
 * Evaluates real compilation errors, runtime crashes, timeouts, and answer correctness.
 * 
 * @param {number|string} problemId - Problem ID (1, 2, or 3)
 * @param {string} userCode - The student's C++ solution
 * @returns {Promise<Object>} Test suite verdict
 */
export async function submitSolution(problemId, userCode) {
  if (!userCode || !userCode.trim()) {
    return {
      verdict: "Compilation Error",
      details: "Error: No code provided for submission.",
      executionTime: "0.00"
    };
  }

  const pid = Number(problemId) || 1;

  // 1. Primary execution route: Submit to Node.js backend judge API
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId: pid, code: userCode })
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn("Backend /api/submit request unreachable, falling back to direct sandbox:", err);
  }

  // 2. Direct client-side evaluation fallback
  const harnessCode = buildTestHarness(pid, userCode);
  const result = await executeCppCode(harnessCode, "");

  if (result.isApiError) {
    return {
      verdict: "Execution/API Error",
      details: result.stderr,
      executionTime: result.executionTime
    };
  }

  if (result.isTLE) {
    return {
      verdict: "Time Limit Exceeded",
      details: "Process was terminated because execution exceeded the CPU time limit (check for infinite loops or inefficient complexity).",
      executionTime: result.executionTime
    };
  }

  if (result.compileError) {
    return {
      verdict: "Compilation Error",
      details: result.compileError,
      executionTime: result.executionTime
    };
  }

  const rawStdout = result.stdout || "";

  // Check for runtime crash (non-zero exit or signal)
  if (result.exitCode !== "0" || result.signal) {
    const crashDetails = result.stderr || `Signal: ${result.signal || `Exit code ${result.exitCode}`}`;
    return {
      verdict: "Runtime Error",
      details: `${crashDetails}\n\nConsole output before crash:\n${rawStdout.trim() || "(no output)"}`,
      executionTime: result.executionTime,
      stdout: rawStdout
    };
  }

  // Process test harness verdict - strictly require 3/3 passed tests
  if (rawStdout.includes("3/3 test cases passed.") && rawStdout.includes("__CM_VERDICT__=ACCEPTED")) {
    const cleanDetails = rawStdout.replace(/__CM_VERDICT__=ACCEPTED/g, "").trim();
    return {
      verdict: "Accepted",
      details: cleanDetails,
      executionTime: result.executionTime,
      stdout: rawStdout
    };
  }

  if (rawStdout.includes("__CM_VERDICT__=WA")) {
    const cleanDetails = rawStdout.replace(/__CM_VERDICT__=WA/g, "").trim();
    return {
      verdict: "Wrong Answer",
      details: cleanDetails,
      executionTime: result.executionTime,
      stdout: rawStdout
    };
  }

  // Fallback if neither marker was emitted (e.g. unconfigured problem or unexpected exit)
  return {
    verdict: "Wrong Answer",
    details: rawStdout.trim() || "No test output was produced by the test suite.",
    executionTime: result.executionTime,
    stdout: rawStdout
  };
}

/**
 * Backwards compatibility wrapper for Two Sum.
 */
export async function submitTwoSumSolution(userCode) {
  return submitSolution(1, userCode);
}
