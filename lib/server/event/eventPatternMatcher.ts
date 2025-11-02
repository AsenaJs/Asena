/**
 * @description Zero-dependency event pattern matcher for Asena event system
 * Supports dot-notation wildcard patterns for event matching
 *
 * Pattern examples:
 * - `*` matches all events
 * - `download.*` matches `download.start`, `download.complete`, etc.
 * - `*.complete` matches any event ending with `.complete`
 * - `user.*.created` matches `user.admin.created`, `user.guest.created`, etc.
 *
 * Algorithm: Iterative backtracking with explicit stack
 * Time Complexity: O(n * m) where n = event segments, m = pattern segments
 * Space Complexity: O(n + m) for the stack
 *
 * @param eventName - The event name to test (e.g., 'download.complete')
 * @param pattern - The pattern to match against (e.g., 'download.*', '*.complete')
 * @returns true if the event name matches the pattern
 *
 * @example
 * matchesEventPattern('download.complete', 'download.*') // => true
 * matchesEventPattern('user.admin.created', 'user.*.created') // => true
 * matchesEventPattern('upload.start', 'download.*') // => false
 */
export function matchesEventPattern(eventName: string, pattern: string): boolean {
  // Exact match (fast path)
  if (eventName === pattern) {
    return true;
  }

  // Universal wildcard matches all events
  if (pattern === '*') {
    return true;
  }

  // No wildcard in pattern means exact match only (already checked above)
  if (!pattern.includes('*')) {
    return false;
  }

  // Split both event and pattern by dots
  const eventSegments = eventName.split('.');
  const patternSegments = pattern.split('.');

  // Use iterative backtracking algorithm to avoid recursion
  return matchSegmentsIterative(eventSegments, patternSegments);
}

/**
 * @description State for iterative backtracking algorithm
 */
interface MatchState {
  eventIndex: number;
  patternIndex: number;
}

/**
 * @description Iteratively matches event segments against pattern segments using backtracking
 * Uses explicit stack to avoid recursion and prevent stack overflow
 *
 * Algorithm explanation:
 * 1. Maintain a stack of (eventIndex, patternIndex) states to explore
 * 2. For each state, try to match current segments
 * 3. On wildcard, push multiple potential states (greedy matching)
 * 4. On exact match, advance both indices
 * 5. If we reach end of both arrays, success
 *
 * @param eventSegments - Array of event name segments
 * @param patternSegments - Array of pattern segments
 * @returns true if segments match
 */
function matchSegmentsIterative(eventSegments: string[], patternSegments: string[]): boolean {
  // Stack for backtracking - holds states to explore
  const stack: MatchState[] = [{ eventIndex: 0, patternIndex: 0 }];

  // Explored states to avoid infinite loops (eventIndex + patternIndex as key)
  const explored = new Set<string>();

  while (stack.length > 0) {
    const state = stack.pop();
    const { eventIndex, patternIndex } = state;

    // Create unique key for this state to avoid re-exploring
    const stateKey = `${eventIndex}:${patternIndex}`;
    if (explored.has(stateKey)) {
      continue;
    }
    explored.add(stateKey);

    // Success: consumed both arrays completely
    if (eventIndex === eventSegments.length && patternIndex === patternSegments.length) {
      return true;
    }

    // Failure: pattern exhausted but event has more segments
    if (patternIndex === patternSegments.length) {
      continue;
    }

    // Failure: event exhausted but pattern has more segments
    // (Wildcards require at least one segment to match)
    if (eventIndex === eventSegments.length) {
      continue;
    }

    const currentPattern = patternSegments[patternIndex];

    // Case 1: Current pattern is wildcard
    if (currentPattern === '*') {
      // If this is the last pattern segment, wildcard must match all remaining event segments
      if (patternIndex === patternSegments.length - 1) {
        // Must have at least one event segment remaining
        if (eventIndex < eventSegments.length) {
          return true;
        }
        continue;
      }

      // Try matching wildcard with 1, 2, 3... event segments (greedy backtracking)
      // Push states in reverse order so we try shortest match first (better performance)
      for (let i = eventSegments.length - 1; i >= eventIndex; i--) {
        stack.push({ eventIndex: i + 1, patternIndex: patternIndex + 1 });
      }
      continue;
    }

    // Case 2: Current pattern is not wildcard - must match exactly
    if (eventSegments[eventIndex] === currentPattern) {
      stack.push({ eventIndex: eventIndex + 1, patternIndex: patternIndex + 1 });
    }
    // No match, this path fails (don't push any new state)
  }

  // No path led to success
  return false;
}
