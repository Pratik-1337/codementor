/**
 * ==============================================================================
 * CodeMentor - Central Problems Catalog (problems-data.js)
 * ==============================================================================
 * 
 * Single source of truth for all curated DSA problems in CodeMentor.
 * Consumed by both the Dashboard (problem preview list & metrics)
 * and the Problem Workspace (editor, statements, examples, and test templates).
 * ==============================================================================
 */

export const PROBLEMS = [
  {
    id: 1,
    title: "Two Sum",
    difficulty: "Easy",
    difficultyClass: "badge-difficulty-easy",
    topics: "Arrays · Hash Map",
    statement: `Given an array of integers <code>nums</code> and an integer <code>target</code>, return <em>the indices of the two numbers such that they add up to <code>target</code></em>.<br><br>You may assume that each input would have <strong>exactly one solution</strong>, and you may not use the same element twice. You can return the answer in any order.`,
    examples: [
      {
        input: "nums = [2,7,11,15], target = 9",
        output: "[0,1]",
        explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]."
      },
      {
        input: "nums = [3,2,4], target = 6",
        output: "[1,2]",
        explanation: "Because nums[1] + nums[2] == 6, we return [1, 2]."
      }
    ],
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Only one valid answer exists."
    ],
    starterCode: `#include <bits/stdc++.h>
using namespace std;

// Problem 1: Two Sum (Easy)
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
}`,
    defaultStdin: "4\n2 7 11 15\n9"
  },
  {
    id: 2,
    title: "Container With Most Water",
    difficulty: "Medium",
    difficultyClass: "badge-difficulty-medium",
    topics: "Two Pointers · Array · Greedy",
    statement: `You are given an integer array <code>height</code> of length <code>n</code>. There are <code>n</code> vertical lines drawn such that the two endpoints of the <code>i<sup>th</sup></code> line are <code>(i, 0)</code> and <code>(i, height[i])</code>.<br><br>Find two lines that together with the x-axis form a container, such that the container contains the most water.<br><br>Return <em>the maximum amount of water a container can store</em>. Notice that you may not slant the container.`,
    examples: [
      {
        input: "height = [1,8,6,2,5,4,8,3,7]",
        output: "49",
        explanation: "The vertical lines are at indices 1 and 8 with heights 8 and 7. The width is 8 - 1 = 7. Max area = min(8, 7) * 7 = 49."
      },
      {
        input: "height = [1,1]",
        output: "1",
        explanation: "The width is 1 - 0 = 1, and minimum height is 1. Area = 1 * 1 = 1."
      }
    ],
    constraints: [
      "n == height.length",
      "2 <= n <= 10^5",
      "0 <= height[i] <= 10^4"
    ],
    starterCode: `#include <bits/stdc++.h>
using namespace std;

// Problem 2: Container With Most Water (Medium)
// Find two lines that together with the x-axis form a container
// containing the most water. Return the maximum amount of water.

int maxArea(vector<int>& height) {
    // Write your solution here:
    int left = 0, right = height.size() - 1;
    int maxWater = 0;

    while (left < right) {
        int width = right - left;
        int currentWater = min(height[left], height[right]) * width;
        maxWater = max(maxWater, currentWater);

        if (height[left] < height[right]) {
            left++;
        } else {
            right--;
        }
    }
    return maxWater;
}

int main() {
    vector<int> height = {1, 8, 6, 2, 5, 4, 8, 3, 7};

    cout << "Input: height = [1,8,6,2,5,4,8,3,7]" << endl;
    int result = maxArea(height);
    cout << "Output: " << result << endl;
    return 0;
}`,
    defaultStdin: "9\n1 8 6 2 5 4 8 3 7"
  },
  {
    id: 3,
    title: "Trapping Rain Water",
    difficulty: "Hard",
    difficultyClass: "badge-difficulty-hard",
    topics: "Two Pointers · Dynamic Programming · Stack",
    statement: `Given <code>n</code> non-negative integers representing an elevation map where the width of each bar is <code>1</code>, compute how much water it can trap after raining.`,
    examples: [
      {
        input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]",
        output: "6",
        explanation: "The elevation map traps 6 units of rain water between the bars."
      },
      {
        input: "height = [4,2,0,3,2,5]",
        output: "9",
        explanation: "The elevation map traps 9 units of rain water."
      }
    ],
    constraints: [
      "n == height.length",
      "1 <= n <= 2 * 10^4",
      "0 <= height[i] <= 10^5"
    ],
    starterCode: `#include <bits/stdc++.h>
using namespace std;

// Problem 3: Trapping Rain Water (Hard)
// Compute how much water the elevation map can trap after raining.

int trap(vector<int>& height) {
    // Write your solution here:
    int left = 0, right = height.size() - 1;
    int left_max = 0, right_max = 0;
    int trappedWater = 0;

    while (left < right) {
        if (height[left] < height[right]) {
            if (height[left] >= left_max) {
                left_max = height[left];
            } else {
                trappedWater += left_max - height[left];
            }
            left++;
        } else {
            if (height[right] >= right_max) {
                right_max = height[right];
            } else {
                trappedWater += right_max - height[right];
            }
            right--;
        }
    }
    return trappedWater;
}

int main() {
    vector<int> height = {0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1};

    cout << "Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]" << endl;
    int result = trap(height);
    cout << "Output: " << result << endl;
    return 0;
}`,
    defaultStdin: "12\n0 1 0 2 1 0 1 3 2 1 2 1"
  }
];
