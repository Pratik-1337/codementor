/**
 * ==============================================================================
 * CodeMentor - User Progress Tracking Service (progress.js)
 * ==============================================================================
 * 
 * Persists and computes individual user DSA progress (Attempted & Solved):
 * 1. Backed by Cloud Firestore under `users/{uid}/progress/{problemId}`
 * 2. Cached in `localStorage` under `codementor_progress_{uid}` for offline & instant reload
 * 3. Deduplicates unique problem attempts and accepted solutions
 * 4. Calculates statistics and progress percentages dynamically
 * ==============================================================================
 */

import { doc, getDoc, setDoc, getDocs, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

/**
 * Storage key partitioned by user UID to ensure user data isolation
 * 
 * @param {string} uid - Firebase Auth UID
 * @returns {string}
 */
function getStorageKey(uid) {
  return `codementor_progress_${uid}`;
}

/**
 * Retrieves the local progress cache for a user
 * 
 * @param {string} uid - Firebase Auth UID
 * @returns {Object} Map of problemId -> { problemId, attempted, solved, updatedAt }
 */
export function getLocalProgress(uid) {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Could not read local progress cache:", err);
    return {};
  }
}

/**
 * Saves the local progress cache for a user
 * 
 * @param {string} uid - Firebase Auth UID
 * @param {Object} map - Progress map
 */
export function saveLocalProgress(uid, map) {
  if (!uid) return;
  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(map));
  } catch (err) {
    console.warn("Could not save local progress cache:", err);
  }
}

/**
 * Records an execution attempt or submission result for a problem.
 * 
 * - Attempted: marked true whenever user runs or submits code.
 * - Solved: marked true ONLY when submission receives an "Accepted" verdict.
 * - Deduplication: problemId is unique key, repeated runs/solves do not increment count.
 * 
 * @param {string} uid - Authenticated user UID
 * @param {number|string} problemId - Problem ID (1, 2, 3...)
 * @param {Object} status - { attempted: boolean, solved: boolean }
 * @returns {Promise<Object>} The updated progress map
 */
export async function trackProblemProgress(uid, problemId, { attempted = false, solved = false } = {}) {
  if (!uid || !problemId) return null;

  const pid = String(problemId);
  const currentMap = getLocalProgress(uid);
  const existing = currentMap[pid] || { attempted: false, solved: false };

  // Calculate new deduplicated states:
  // Once attempted is true, it stays true.
  // Once solved is true, it stays true.
  const isAttempted = Boolean(existing.attempted || attempted);
  const isSolved = Boolean(existing.solved || solved);

  const updatedItem = {
    problemId: Number(problemId),
    attempted: isAttempted,
    solved: isSolved,
    updatedAt: Date.now()
  };

  currentMap[pid] = updatedItem;
  saveLocalProgress(uid, currentMap);

  // Sync to Cloud Firestore: users/{uid}/progress/{problemId}
  try {
    if (db) {
      const progressDocRef = doc(db, "users", uid, "progress", pid);
      await setDoc(progressDocRef, {
        problemId: Number(problemId),
        attempted: isAttempted,
        solved: isSolved,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (firestoreErr) {
    console.warn("Firestore progress sync notice (saved locally):", firestoreErr?.message || firestoreErr);
  }

  return currentMap;
}

/**
 * Loads the user's progress from Firestore with instant local storage fallback.
 * Calculates unique attempted and solved counts.
 * 
 * @param {string} uid - Authenticated user UID
 * @returns {Promise<{ attemptedCount: number, solvedCount: number, solvedProblemIds: Set<number>, progressMap: Object }>}
 */
export async function getUserProgress(uid) {
  if (!uid) {
    return {
      attemptedCount: 0,
      solvedCount: 0,
      solvedProblemIds: new Set(),
      progressMap: {}
    };
  }

  let map = getLocalProgress(uid);

  // Sync latest from Firestore if available
  try {
    if (db) {
      const colRef = collection(db, "users", uid, "progress");
      const querySnap = await getDocs(colRef);

      if (!querySnap.empty) {
        querySnap.forEach((docSnap) => {
          const data = docSnap.data();
          const pid = String(data.problemId || docSnap.id);
          const existing = map[pid] || {};

          map[pid] = {
            problemId: Number(pid),
            attempted: Boolean(data.attempted || existing.attempted),
            solved: Boolean(data.solved || existing.solved),
            updatedAt: data.updatedAt ? (data.updatedAt.toMillis ? data.updatedAt.toMillis() : Date.now()) : (existing.updatedAt || Date.now())
          };
        });
        saveLocalProgress(uid, map);
      }
    }
  } catch (err) {
    console.warn("Firestore progress load notice (using local cache):", err?.message || err);
  }

  // Calculate unique counts
  let attemptedCount = 0;
  let solvedCount = 0;
  const solvedProblemIds = new Set();

  Object.values(map).forEach((item) => {
    if (item.attempted) {
      attemptedCount++;
    }
    if (item.solved) {
      solvedCount++;
      solvedProblemIds.add(Number(item.problemId));
    }
  });

  return {
    attemptedCount,
    solvedCount,
    solvedProblemIds,
    progressMap: map
  };
}
