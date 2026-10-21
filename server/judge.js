/**
 * ==============================================================================
 * CodeMentor - C++ Judging Engine & Test Suite Service (server/judge.js)
 * ==============================================================================
 * 
 * Executes student C++ solutions against exactly 3 structured test cases per problem.
 * Every test case is executed separately against its own input and evaluated
 * against its expected result using problem-specific validation logic.
 * ==============================================================================
 */

const WANDBOX_API = "https://wandbox.org/api/compile.json";

/**
 * Compiles and executes C++ source code with optional standard input in Wandbox sandbox.
 * 
 * @param {string} code - C++ source code
 * @param {string} stdin - Custom standard input passed to cin
 * @returns {Promise<Object>} Execution result object
 */
export async function executeInSandbox(code, stdin = "") {
  const startTime = performance.now();
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

      if (response.status === 429 && attempt < maxAttempts) {
        console.warn("[Judge Execution]: Wandbox 429 received, retrying in 2s...");
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Wandbox sandbox responded with HTTP status ${response.status}`);
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
      if (attempt < maxAttempts && error.message.includes("429")) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      console.error("[Judge Execution Error]:", error.message);
      return {
        success: false,
        isTLE: false,
        isApiError: true,
        compileError: "",
        stdout: "",
        stderr: `Execution/API Error: ${error.message}. Please check connection.`,
        executionTime: "0.00",
        exitCode: "1",
        signal: ""
      };
    }
  }
}

/**
 * Defines the 3 structured test cases for each problem.
 */
export const PROBLEM_TEST_CASES = {
  // Problem 1: Two Sum
  1: [
    {
      caseIndex: 1,
      name: "Test 1 (Basic Example)",
      inputDescription: "nums = [3, 2, 4], target = 6",
      input: { nums: [3, 2, 4], target: 6 },
      expectedDescription: "[1, 2] (indices with values 2 and 4 summing to 6)",
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> nums = {3, 2, 4};
    int target = 6;

    vector<int> res;
    try {
        res = ${caller}twoSum(nums, target);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=";
    if (res.size() == 2) {
        cout << res[0] << "," << res[1] << endl;
    } else if (res.empty()) {
        cout << "EMPTY" << endl;
    } else {
        cout << "SIZE_" << res.size() << endl;
    }
    return 0;
}
`,
      validate: (rawOutput, input) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const val = match[1].trim();
        if (val === "EMPTY") {
          return { passed: false, actual: "[] (empty vector returned)", reason: "No indices returned" };
        }
        const rawParts = val.split(",").map(s => s.trim());
        if (rawParts.length !== 2 || !rawParts.every(p => /^-?\d+$/.test(p))) {
          return { passed: false, actual: val, reason: "Expected 2 valid integer indices" };
        }
        const [i1, i2] = rawParts.map(s => parseInt(s, 10));
        const n = input.nums.length;
        if (i1 < 0 || i1 >= n || i2 < 0 || i2 >= n) {
          return { passed: false, actual: `[${i1}, ${i2}] (indices out of bounds!)`, reason: "Index out of bounds" };
        }
        if (i1 === i2) {
          return { passed: false, actual: `[${i1}, ${i2}] (indices not distinct, element reused!)`, reason: "Reused same element" };
        }
        const sum = input.nums[i1] + input.nums[i2];
        if (sum !== input.target) {
          return { passed: false, actual: `[${i1}, ${i2}] (sum was ${sum} != ${input.target})`, reason: "Sum does not equal target" };
        }
        return { passed: true, actual: `[${i1}, ${i2}]` };
      }
    },
    {
      caseIndex: 2,
      name: "Test 2 (Normal Functionality)",
      inputDescription: "nums = [2, 7, 11, 15], target = 9",
      input: { nums: [2, 7, 11, 15], target: 9 },
      expectedDescription: "[0, 1] (indices with values 2 and 7 summing to 9)",
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> nums = {2, 7, 11, 15};
    int target = 9;

    vector<int> res;
    try {
        res = ${caller}twoSum(nums, target);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=";
    if (res.size() == 2) {
        cout << res[0] << "," << res[1] << endl;
    } else if (res.empty()) {
        cout << "EMPTY" << endl;
    } else {
        cout << "SIZE_" << res.size() << endl;
    }
    return 0;
}
`,
      validate: (rawOutput, input) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const val = match[1].trim();
        if (val === "EMPTY") {
          return { passed: false, actual: "[] (empty vector returned)", reason: "No indices returned" };
        }
        const rawParts = val.split(",").map(s => s.trim());
        if (rawParts.length !== 2 || !rawParts.every(p => /^-?\d+$/.test(p))) {
          return { passed: false, actual: val, reason: "Expected 2 valid integer indices" };
        }
        const [i1, i2] = rawParts.map(s => parseInt(s, 10));
        const n = input.nums.length;
        if (i1 < 0 || i1 >= n || i2 < 0 || i2 >= n) {
          return { passed: false, actual: `[${i1}, ${i2}] (indices out of bounds!)`, reason: "Index out of bounds" };
        }
        if (i1 === i2) {
          return { passed: false, actual: `[${i1}, ${i2}] (indices not distinct, element reused!)`, reason: "Reused same element" };
        }
        const sum = input.nums[i1] + input.nums[i2];
        if (sum !== input.target) {
          return { passed: false, actual: `[${i1}, ${i2}] (sum was ${sum} != ${input.target})`, reason: "Sum does not equal target" };
        }
        return { passed: true, actual: `[${i1}, ${i2}]` };
      }
    },
    {
      caseIndex: 3,
      name: "Test 3 (Edge Case - Duplicate Values)",
      inputDescription: "nums = [3, 3], target = 6",
      input: { nums: [3, 3], target: 6 },
      expectedDescription: "two distinct indices summing to 6 (e.g. [0, 1])",
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> nums = {3, 3};
    int target = 6;

    vector<int> res;
    try {
        res = ${caller}twoSum(nums, target);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=";
    if (res.size() == 2) {
        cout << res[0] << "," << res[1] << endl;
    } else if (res.empty()) {
        cout << "EMPTY" << endl;
    } else {
        cout << "SIZE_" << res.size() << endl;
    }
    return 0;
}
`,
      validate: (rawOutput, input) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const val = match[1].trim();
        if (val === "EMPTY") {
          return { passed: false, actual: "[] (empty vector returned)", reason: "No indices returned" };
        }
        const rawParts = val.split(",").map(s => s.trim());
        if (rawParts.length !== 2 || !rawParts.every(p => /^-?\d+$/.test(p))) {
          return { passed: false, actual: val, reason: "Expected 2 valid integer indices" };
        }
        const [i1, i2] = rawParts.map(s => parseInt(s, 10));
        const n = input.nums.length;
        if (i1 < 0 || i1 >= n || i2 < 0 || i2 >= n) {
          return { passed: false, actual: `[${i1}, ${i2}] (indices out of bounds!)`, reason: "Index out of bounds" };
        }
        if (i1 === i2) {
          return { passed: false, actual: `[${i1}, ${i2}] (indices not distinct, element reused!)`, reason: "Reused same element" };
        }
        const sum = input.nums[i1] + input.nums[i2];
        if (sum !== input.target) {
          return { passed: false, actual: `[${i1}, ${i2}] (sum was ${sum} != ${input.target})`, reason: "Sum does not equal target" };
        }
        return { passed: true, actual: `[${i1}, ${i2}]` };
      }
    }
  ],

  // Problem 2: Container With Most Water
  2: [
    {
      caseIndex: 1,
      name: "Test 1 (Basic Example)",
      inputDescription: "height = [1, 8, 6, 2, 5, 4, 8, 3, 7]",
      input: { height: [1, 8, 6, 2, 5, 4, 8, 3, 7] },
      expectedDescription: "49",
      expectedValue: 49,
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> height = {1, 8, 6, 2, 5, 4, 8, 3, 7};

    int res = 0;
    try {
        res = ${caller}maxArea(height);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=" << res << endl;
    return 0;
}
`,
      validate: (rawOutput) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const rawVal = match[1].trim();
        if (rawVal === "" || !/^-?\d+$/.test(rawVal)) {
          return { passed: false, actual: rawVal || "(invalid numeric output)", reason: "Unparsable numeric result" };
        }
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) {
          return { passed: false, actual: rawVal, reason: "Unparsable numeric result" };
        }
        return { passed: val === 49, actual: String(val) };
      }
    },
    {
      caseIndex: 2,
      name: "Test 2 (Normal Functionality)",
      inputDescription: "height = [4, 3, 2, 1, 4]",
      input: { height: [4, 3, 2, 1, 4] },
      expectedDescription: "16",
      expectedValue: 16,
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> height = {4, 3, 2, 1, 4};

    int res = 0;
    try {
        res = ${caller}maxArea(height);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=" << res << endl;
    return 0;
}
`,
      validate: (rawOutput) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const rawVal = match[1].trim();
        if (rawVal === "" || !/^-?\d+$/.test(rawVal)) {
          return { passed: false, actual: rawVal || "(invalid numeric output)", reason: "Unparsable numeric result" };
        }
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) {
          return { passed: false, actual: rawVal, reason: "Unparsable numeric result" };
        }
        return { passed: val === 16, actual: String(val) };
      }
    },
    {
      caseIndex: 3,
      name: "Test 3 (Edge Case - Minimum Array Length)",
      inputDescription: "height = [1, 1]",
      input: { height: [1, 1] },
      expectedDescription: "1",
      expectedValue: 1,
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> height = {1, 1};

    int res = 0;
    try {
        res = ${caller}maxArea(height);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=" << res << endl;
    return 0;
}
`,
      validate: (rawOutput) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const rawVal = match[1].trim();
        if (rawVal === "" || !/^-?\d+$/.test(rawVal)) {
          return { passed: false, actual: rawVal || "(invalid numeric output)", reason: "Unparsable numeric result" };
        }
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) {
          return { passed: false, actual: rawVal, reason: "Unparsable numeric result" };
        }
        return { passed: val === 1, actual: String(val) };
      }
    }
  ],

  // Problem 3: Trapping Rain Water
  3: [
    {
      caseIndex: 1,
      name: "Test 1 (Basic Example)",
      inputDescription: "height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]",
      input: { height: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1] },
      expectedDescription: "6",
      expectedValue: 6,
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> height = {0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1};

    int res = 0;
    try {
        res = ${caller}trap(height);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=" << res << endl;
    return 0;
}
`,
      validate: (rawOutput) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const rawVal = match[1].trim();
        if (rawVal === "" || !/^-?\d+$/.test(rawVal)) {
          return { passed: false, actual: rawVal || "(invalid numeric output)", reason: "Unparsable numeric result" };
        }
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) {
          return { passed: false, actual: rawVal, reason: "Unparsable numeric result" };
        }
        return { passed: val === 6, actual: String(val) };
      }
    },
    {
      caseIndex: 2,
      name: "Test 2 (Normal Functionality)",
      inputDescription: "height = [4, 2, 0, 3, 2, 5]",
      input: { height: [4, 2, 0, 3, 2, 5] },
      expectedDescription: "9",
      expectedValue: 9,
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> height = {4, 2, 0, 3, 2, 5};

    int res = 0;
    try {
        res = ${caller}trap(height);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=" << res << endl;
    return 0;
}
`,
      validate: (rawOutput) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const rawVal = match[1].trim();
        if (rawVal === "" || !/^-?\d+$/.test(rawVal)) {
          return { passed: false, actual: rawVal || "(invalid numeric output)", reason: "Unparsable numeric result" };
        }
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) {
          return { passed: false, actual: rawVal, reason: "Unparsable numeric result" };
        }
        return { passed: val === 9, actual: String(val) };
      }
    },
    {
      caseIndex: 3,
      name: "Test 3 (Edge Case - Decreasing Elevation)",
      inputDescription: "height = [5, 4, 3, 2, 1]",
      input: { height: [5, 4, 3, 2, 1] },
      expectedDescription: "0",
      expectedValue: 0,
      buildHarness: (userCode, caller) => `
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

int main() {
    using namespace std;
    vector<int> height = {5, 4, 3, 2, 1};

    int res = 0;
    try {
        res = ${caller}trap(height);
    } catch (...) {
        cout << "__CM_EXCEPTION__" << endl;
        return 0;
    }

    cout << "__CM_RESULT__=" << res << endl;
    return 0;
}
`,
      validate: (rawOutput) => {
        if (rawOutput.includes("__CM_EXCEPTION__")) {
          return { passed: false, actual: "(runtime exception thrown)", reason: "Exception thrown during execution" };
        }
        const match = rawOutput.match(/__CM_RESULT__=([^\r\n]+)/);
        if (!match) {
          return { passed: false, actual: rawOutput.trim() || "(empty)", reason: "No result marker emitted" };
        }
        const rawVal = match[1].trim();
        if (rawVal === "" || !/^-?\d+$/.test(rawVal)) {
          return { passed: false, actual: rawVal || "(invalid numeric output)", reason: "Unparsable numeric result" };
        }
        const val = parseInt(rawVal, 10);
        if (isNaN(val)) {
          return { passed: false, actual: rawVal, reason: "Unparsable numeric result" };
        }
        return { passed: val === 0, actual: String(val) };
      }
    }
  ]
};

/**
 * Returns the 3 test cases for a specific problem ID.
 */
export function getProblemTestCases(problemId) {
  const pid = Number(problemId) || 1;
  return PROBLEM_TEST_CASES[pid] || PROBLEM_TEST_CASES[1];
}

/**
 * Executes a student's C++ code separately against all 3 test cases for the problem.
 * Evaluates real compilation errors, execution status, and answers against expected results.
 * 
 * @param {number|string} problemId
 * @param {string} userCode
 * @returns {Promise<Object>} Full evaluation result
 */
export async function evaluateSubmission(problemId, userCode) {
  const pid = Number(problemId) || 1;
  const testCases = getProblemTestCases(pid);

  // Server-side logging required by specification
  console.log(`[Judge] Submission received for Problem #${pid}. Total test cases: ${testCases.length}`);

  if (!userCode || !userCode.trim()) {
    return {
      verdict: "Compilation Error",
      passedCount: 0,
      totalTests: testCases.length,
      details: "Error: No code provided for submission.",
      executionTime: "0.00",
      testResults: []
    };
  }

  const hasClassSolution = /\bclass\s+Solution\b/.test(userCode);
  const caller = hasClassSolution ? "Solution()." : "";

  const results = [];
  let totalExecutionTime = 0;
  let encounteredCompilationError = false;
  let compileErrorMessage = "";

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    if (i > 0) {
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`[Judge] Problem #${pid} - Executing Case ${i + 1}/${testCases.length} (${tc.name})...`);

    const harnessCode = tc.buildHarness(userCode, caller);
    const execResult = await executeInSandbox(harnessCode, "");
    totalExecutionTime += parseFloat(execResult.executionTime) || 0;

    // 1. Check for compilation error (detected on first test execution)
    if (execResult.compileError) {
      encounteredCompilationError = true;
      compileErrorMessage = execResult.compileError;
      console.log(`[Judge] Problem #${pid} - Compilation error encountered on Case ${i + 1}. Aborting remaining test cases.`);
      break;
    }

    // 2. Check for Time Limit Exceeded
    if (execResult.isTLE) {
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} exceeded CPU time limit (TLE).`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: false,
        status: "Time Limit Exceeded",
        actual: "Time Limit Exceeded (process terminated)",
        expected: tc.expectedDescription
      });
      continue;
    }

    // 3. Check for API failure
    if (execResult.isApiError) {
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} execution API failed: ${execResult.stderr}`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: false,
        status: "Execution/API Error",
        actual: execResult.stderr || "(failed API request)",
        expected: tc.expectedDescription
      });
      continue;
    }

    // 4. Check for missing execution status
    if (execResult.exitCode === "UNKNOWN") {
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} missing execution status.`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: false,
        status: "Runtime Error",
        actual: "Missing execution status from sandbox",
        expected: tc.expectedDescription
      });
      continue;
    }

    // 5. Check for runtime crash (non-zero exit code or signal)
    if (execResult.exitCode !== "0" || execResult.signal) {
      const crashDetails = execResult.stderr || `Signal: ${execResult.signal || `Exit code ${execResult.exitCode}`}`;
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} runtime error: ${crashDetails}`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: false,
        status: "Runtime Error",
        actual: `Program crashed (${crashDetails})`,
        expected: tc.expectedDescription
      });
      continue;
    }

    // 6. Check for empty output or missing result marker
    if (!execResult.stdout || !execResult.stdout.trim() || !execResult.stdout.includes("__CM_RESULT__")) {
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} produced empty output or missing result marker.`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: false,
        status: "Wrong Answer",
        actual: execResult.stdout.trim() || "(empty output - missing result marker)",
        expected: tc.expectedDescription
      });
      continue;
    }

    // 7. Validate output against expected result
    const validation = tc.validate(execResult.stdout, tc.input);
    if (validation.passed) {
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} completed: PASS (Output: ${validation.actual})`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: true,
        status: "Passed",
        actual: validation.actual,
        expected: tc.expectedDescription
      });
    } else {
      console.log(`[Judge] Problem #${pid} - Case ${i + 1}/${testCases.length} completed: FAIL (Output: ${validation.actual} | Expected: ${tc.expectedDescription})`);
      results.push({
        caseIndex: tc.caseIndex,
        name: tc.name,
        input: tc.inputDescription,
        passed: false,
        status: "Wrong Answer",
        actual: validation.actual,
        expected: tc.expectedDescription
      });
    }
  }

  // Handle compilation error: no test case marked passed
  if (encounteredCompilationError) {
    console.log(`[Judge] Problem #${pid} - Final Verdict: COMPILATION ERROR (0/${testCases.length} test cases passed)`);
    return {
      verdict: "Compilation Error",
      passedCount: 0,
      totalTests: testCases.length,
      details: compileErrorMessage,
      executionTime: totalExecutionTime.toFixed(2),
      testResults: []
    };
  }

  // Count passed tests - ensure Accepted strictly requires all 3 tests to execute and pass
  const passedCount = results.filter(r => r.passed).length;
  const allTestsPassed = 
    testCases.length === 3 &&
    results.length === 3 &&
    passedCount === 3 &&
    results.every(r => r.passed === true);

  let finalVerdict = "Wrong Answer";

  if (allTestsPassed) {
    finalVerdict = "Accepted";
  } else if (results.some(r => r.status === "Time Limit Exceeded") && !results.some(r => r.status === "Wrong Answer")) {
    finalVerdict = "Time Limit Exceeded";
  } else if (results.some(r => r.status === "Runtime Error" || r.status === "Execution/API Error") && !results.some(r => r.status === "Wrong Answer")) {
    finalVerdict = "Runtime Error";
  } else {
    finalVerdict = "Wrong Answer";
  }

  console.log(`[Judge] Problem #${pid} - Final Verdict: ${finalVerdict.toUpperCase()} (${passedCount}/${testCases.length} test cases passed)`);

  // Build clean details string displaying each test result
  const detailLines = [];
  for (const r of results) {
    const inputPrefix = r.input ? `: ${r.input}` : "";
    if (r.passed) {
      detailLines.push(`[PASS] ${r.name}${inputPrefix} -> Output: ${r.actual}`);
    } else {
      detailLines.push(`[FAIL] ${r.name}${inputPrefix}`);
      detailLines.push(`       Expected: ${r.expected}`);
      detailLines.push(`       Actual Output: ${r.actual}`);
    }
  }

  detailLines.push("");
  detailLines.push(`${passedCount}/${testCases.length} test cases passed.`);

  return {
    verdict: finalVerdict,
    passedCount: passedCount,
    totalTests: testCases.length,
    details: detailLines.join("\n"),
    executionTime: totalExecutionTime.toFixed(2),
    testResults: results
  };
}
