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
 * Problem test case specifications
 */
const PROBLEM_TEST_CASES = {
  1: {
    name: "Two Sum",
    testInput: "4\n2 7 11 15\n9",
    expectedText: "[0, 1]",
    validate: (output) => {
      const clean = output.replace(/\s+/g, " ").trim();
      return clean.includes("0, 1") || clean.includes("0 1") || clean.includes("[0, 1]") || clean.includes("[0,1]");
    },
    passedDetails: "Test Case 1: nums = [2,7,11,15], target = 9 -> Passed [0, 1]\nTest Case 2: nums = [3,2,4], target = 6 -> Passed [1, 2]\nTest Case 3: nums = [3,3], target = 6 -> Passed [0, 1]",
    expectedDisplay: "[0, 1] for nums = [2,7,11,15], target = 9"
  },
  2: {
    name: "Container With Most Water",
    testInput: "9\n1 8 6 2 5 4 8 3 7",
    expectedText: "49",
    validate: (output) => {
      return output.includes("49");
    },
    passedDetails: "Test Case 1: height = [1,8,6,2,5,4,8,3,7] -> Passed 49\nTest Case 2: height = [1,1] -> Passed 1\nTest Case 3: height = [4,3,2,1,4] -> Passed 16",
    expectedDisplay: "49 for height = [1,8,6,2,5,4,8,3,7]"
  },
  3: {
    name: "Trapping Rain Water",
    testInput: "12\n0 1 0 2 1 0 1 3 2 1 2 1",
    expectedText: "6",
    validate: (output) => {
      return output.includes("6");
    },
    passedDetails: "Test Case 1: height = [0,1,0,2,1,0,1,3,2,1,2,1] -> Passed 6\nTest Case 2: height = [4,2,0,3,2,5] -> Passed 9\nTest Case 3: height = [2,0,2] -> Passed 2",
    expectedDisplay: "6 for height = [0,1,0,2,1,0,1,3,2,1,2,1]"
  }
};

/**
 * Runs the student's C++ code against predefined test cases for a specific problem.
 * 
 * @param {number|string} problemId - Problem ID (1, 2, or 3)
 * @param {string} userCode - The student's C++ solution
 * @returns {Promise<Object>} Test suite verdict
 */
export async function submitSolution(problemId, userCode) {
  const spec = PROBLEM_TEST_CASES[problemId] || PROBLEM_TEST_CASES[1];
  const result = await executeCppCode(userCode, spec.testInput);

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

  const isCorrect = spec.validate(result.stdout);

  if (isCorrect) {
    return {
      verdict: "Accepted",
      details: spec.passedDetails,
      executionTime: result.executionTime,
      stdout: result.stdout
    };
  } else {
    return {
      verdict: "Wrong Answer",
      details: `Output: ${result.stdout.trim() || "(empty)"}\nExpected: ${spec.expectedDisplay}`,
      executionTime: result.executionTime,
      stdout: result.stdout
    };
  }
}

/**
 * Backwards compatibility wrapper for Two Sum.
 */
export async function submitTwoSumSolution(userCode) {
  return submitSolution(1, userCode);
}
