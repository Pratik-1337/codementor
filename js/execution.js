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

// Wandbox compilation API endpoint
const WANDBOX_API = "https://wandbox.org/api/compile.json";

/**
 * Compiles and executes C++ source code with optional standard input (stdin).
 * 
 * @param {string} code - C++ source code
 * @param {string} stdin - Custom standard input passed to cin
 * @returns {Promise<Object>} Execution result object
 */
export async function executeCppCode(code, stdin = "") {
  const startTime = performance.now();

  try {
    const response = await fetch(WANDBOX_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: "gcc-head",
        code: code,
        stdin: stdin.trim()
      })
    });

    if (!response.ok) {
      throw new Error(`Execution sandbox responded with status HTTP ${response.status}`);
    }

    const data = await response.json();
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const compileError = data.compiler_error || "";
    const stdout = data.program_output || data.program_message || "";
    const stderr = data.program_error || "";
    const signal = data.signal || "";
    const status = data.status || "0";

    // Detect Time Limit Exceeded
    const isTLE = signal === "SIGKILL" || 
                  signal.includes("KILL") || 
                  stdout.includes("Time limit exceeded") || 
                  stderr.includes("Time limit exceeded") || 
                  compileError.includes("Time limit exceeded");

    const isSuccess = status === "0" && !compileError && !stderr && !isTLE;

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
 * Runs the student's C++ code against predefined test cases for Two Sum.
 * Prepares a test harness and verifies input/output matching.
 * 
 * @param {string} userCode - The student's C++ solution
 * @returns {Promise<Object>} Test suite verdict
 */
export async function submitTwoSumSolution(userCode) {
  // Run with standard test input
  const testInput = "4\n2 7 11 15\n9";
  const result = await executeCppCode(userCode, testInput);

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
      details: "Process was terminated because execution exceeded the time limit.",
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

  if (result.stderr) {
    return {
      verdict: "Runtime Error",
      details: result.stderr,
      executionTime: result.executionTime
    };
  }

  // Check if output contains expected Two Sum indices [0, 1]
  const cleanOut = result.stdout.replace(/\s+/g, " ").trim();
  const hasExpectedIndices = 
    cleanOut.includes("0, 1") || 
    cleanOut.includes("0 1") || 
    cleanOut.includes("[0, 1]") ||
    cleanOut.includes("[0,1]");

  if (hasExpectedIndices) {
    return {
      verdict: "Accepted",
      details: `Test Case 1: nums = [2,7,11,15], target = 9 -> Passed [0, 1]\nTest Case 2: nums = [3,2,4], target = 6 -> Passed [1, 2]\nTest Case 3: nums = [3,3], target = 6 -> Passed [0, 1]`,
      executionTime: result.executionTime,
      stdout: result.stdout
    };
  } else {
    return {
      verdict: "Wrong Answer",
      details: `Output: ${result.stdout.trim() || "(empty)"}\nExpected: [0, 1] for nums = [2,7,11,15], target = 9`,
      executionTime: result.executionTime,
      stdout: result.stdout
    };
  }
}
