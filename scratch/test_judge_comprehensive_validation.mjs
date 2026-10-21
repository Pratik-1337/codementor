import assert from "node:assert";

const BASE_URL = "http://localhost:3001";

async function submitToJudge(problemId, code) {
  const res = await fetch(`${BASE_URL}/api/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problemId, code })
  });
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

console.log("===============================================================");
console.log("RUNNING COMPREHENSIVE VERIFICATION SUITE FOR JUDGING LOGIC");
console.log("===============================================================\n");

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  let passedCount = 0;
  let totalTests = 0;

  function record(title, condition, details = "") {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${title}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${title} - Details: ${details}`);
    }
  }

  // TEST 1: Two Sum - Correct solution with reversed indices {2, 1} on nums = [3, 2, 4], target = 6
  console.log("1. Testing Two Sum - Valid solution (reversed index order {2, 1})...");
  const validTwoSumReversed = `
#include <vector>
#include <unordered_map>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); ++i) {
            int complement = target - nums[i];
            if (seen.find(complement) != seen.end()) {
                // Return in reversed order (higher index first)
                return {i, seen[complement]};
            }
            seen[nums[i]] = i;
        }
        return {};
    }
};
`;
  const res1 = await submitToJudge(1, validTwoSumReversed);
  console.log(`   Verdict: ${res1.verdict}, Passed: ${res1.passedCount}/${res1.totalTests}`);
  record(
    "Two Sum correct solution with reversed indices passes as Accepted (3/3)",
    res1.verdict === "Accepted" && res1.passedCount === 3 && res1.totalTests === 3,
    JSON.stringify(res1)
  );

  // TEST 2: Two Sum - Hardcoded {0, 1}
  // nums = [3, 2, 4], target = 6 -> nums[0] + nums[1] = 3 + 2 = 5 != 6. MUST FAIL Test 1!
  console.log("\n2. Testing Two Sum - Hardcoded return {0, 1}...");
  const hardcoded01 = `
#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {0, 1};
    }
};
`;
  const res2 = await submitToJudge(1, hardcoded01);
  console.log(`   Verdict: ${res2.verdict}, Passed: ${res2.passedCount}/${res2.totalTests}`);
  const t1Failed = res2.testResults && res2.testResults[0] && !res2.testResults[0].passed;
  record(
    "Two Sum return {0, 1} fails Test 1 (sum = 5 != 6) and receives Wrong Answer",
    res2.verdict === "Wrong Answer" && t1Failed && res2.passedCount < 3,
    JSON.stringify(res2)
  );

  // TEST 3: Two Sum - Empty vector return {}
  console.log("\n3. Testing Two Sum - Empty vector return {}...");
  const emptyTwoSum = `
#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {};
    }
};
`;
  const res3 = await submitToJudge(1, emptyTwoSum);
  console.log(`   Verdict: ${res3.verdict}, Passed: ${res3.passedCount}/${res3.totalTests}`);
  record(
    "Two Sum empty vector return {} receives Wrong Answer (0/3 passed)",
    res3.verdict === "Wrong Answer" && res3.passedCount === 0,
    JSON.stringify(res3)
  );

  // TEST 4: Two Sum - Reused index return {0, 0}
  console.log("\n4. Testing Two Sum - Reused index return {0, 0}...");
  const reusedIndexTwoSum = `
#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {0, 0};
    }
};
`;
  const res4 = await submitToJudge(1, reusedIndexTwoSum);
  console.log(`   Verdict: ${res4.verdict}, Passed: ${res4.passedCount}/${res4.totalTests}`);
  record(
    "Two Sum reusing the same index return {0, 0} receives Wrong Answer",
    res4.verdict === "Wrong Answer" && res4.passedCount === 0,
    JSON.stringify(res4)
  );

  // TEST 5: Two Sum - Out of bounds index return {0, 99}
  console.log("\n5. Testing Two Sum - Out-of-bounds index return {0, 99}...");
  const oobIndexTwoSum = `
#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {0, 99};
    }
};
`;
  const res5 = await submitToJudge(1, oobIndexTwoSum);
  console.log(`   Verdict: ${res5.verdict}, Passed: ${res5.passedCount}/${res5.totalTests}`);
  record(
    "Two Sum out-of-bounds index receives Wrong Answer",
    res5.verdict === "Wrong Answer" && res5.passedCount === 0,
    JSON.stringify(res5)
  );

  // TEST 6: Problem 2 (Container With Most Water) - Correct Solution
  console.log("\n6. Testing Problem 2 (Container With Most Water) - Correct two-pointer solution...");
  const correctMaxArea = `
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    int maxArea(vector<int>& height) {
        int left = 0, right = height.size() - 1;
        int maxW = 0;
        while (left < right) {
            int h = min(height[left], height[right]);
            maxW = max(maxW, h * (right - left));
            if (height[left] < height[right]) left++;
            else right--;
        }
        return maxW;
    }
};
`;
  const res6 = await submitToJudge(2, correctMaxArea);
  console.log(`   Verdict: ${res6.verdict}, Passed: ${res6.passedCount}/${res6.totalTests}`);
  record(
    "Problem 2 correct solution receives Accepted (3/3)",
    res6.verdict === "Accepted" && res6.passedCount === 3,
    JSON.stringify(res6)
  );

  // TEST 7: Problem 2 (Container With Most Water) - Incorrect return 0
  console.log("\n7. Testing Problem 2 - Incorrect solution returning 0...");
  const wrongMaxArea = `
#include <vector>
using namespace std;

class Solution {
public:
    int maxArea(vector<int>& height) {
        return 0;
    }
};
`;
  const res7 = await submitToJudge(2, wrongMaxArea);
  console.log(`   Verdict: ${res7.verdict}, Passed: ${res7.passedCount}/${res7.totalTests}`);
  record(
    "Problem 2 returning 0 receives Wrong Answer",
    res7.verdict === "Wrong Answer" && res7.passedCount === 0,
    JSON.stringify(res7)
  );

  // TEST 8: Problem 3 (Trapping Rain Water) - Correct Solution
  console.log("\n8. Testing Problem 3 (Trapping Rain Water) - Correct two-pointer solution...");
  const correctTrap = `
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    int trap(vector<int>& height) {
        int n = height.size();
        if (n <= 2) return 0;
        int left = 0, right = n - 1;
        int leftMax = 0, rightMax = 0;
        int total = 0;
        while (left < right) {
            if (height[left] < height[right]) {
                if (height[left] >= leftMax) leftMax = height[left];
                else total += (leftMax - height[left]);
                left++;
            } else {
                if (height[right] >= rightMax) rightMax = height[right];
                else total += (rightMax - height[right]);
                right--;
            }
        }
        return total;
    }
};
`;
  const res8 = await submitToJudge(3, correctTrap);
  console.log(`   Verdict: ${res8.verdict}, Passed: ${res8.passedCount}/${res8.totalTests}`);
  record(
    "Problem 3 correct solution receives Accepted (3/3)",
    res8.verdict === "Accepted" && res8.passedCount === 3,
    JSON.stringify(res8)
  );

  // TEST 9: Problem 3 (Trapping Rain Water) - Incorrect solution returning 100
  console.log("\n9. Testing Problem 3 - Incorrect solution returning 100...");
  const wrongTrap = `
#include <vector>
using namespace std;

class Solution {
public:
    int trap(vector<int>& height) {
        return 100;
    }
};
`;
  const res9 = await submitToJudge(3, wrongTrap);
  console.log(`   Verdict: ${res9.verdict}, Passed: ${res9.passedCount}/${res9.totalTests}`);
  record(
    "Problem 3 returning wrong number receives Wrong Answer",
    res9.verdict === "Wrong Answer" && res9.passedCount === 0,
    JSON.stringify(res9)
  );

  // TEST 10: Compilation Error (syntax error)
  console.log("\n10. Testing compilation error handling...");
  const compileError = `
#include <vector>
class Solution {
public:
    int invalidSyntax() {
        return 123
    }
};
`;
  const res10 = await submitToJudge(1, compileError);
  console.log(`   Verdict: ${res10.verdict}, Passed: ${res10.passedCount}/${res10.totalTests}`);
  record(
    "Compilation error receives Compilation Error verdict (0/3 passed)",
    res10.verdict === "Compilation Error" && res10.passedCount === 0,
    JSON.stringify(res10)
  );

  console.log("\n===============================================================");
  console.log(`TEST SUITE SUMMARY: ${passedCount}/${totalTests} TESTS PASSED`);
  console.log("===============================================================");

  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
