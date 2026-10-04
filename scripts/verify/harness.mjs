/**
 * Minimal dependency-free assertion harness for the domain logic suites.
 *
 * Collects every result, prints a readable report, and exits non-zero when any
 * assertion fails so CI and the pre-commit verification step can gate on it.
 */

const GREEN = '[32m';
const RED = '[31m';
const DIM = '[2m';
const BOLD = '[1m';
const RESET = '[0m';

const results = [];
let currentSuite = 'general';

/** Groups subsequent `test()` calls under a named heading. */
export function suite(name) {
  currentSuite = name;
  return name;
}

/** Registers and immediately runs a single named assertion block. */
export function test(name, fn) {
  try {
    fn();
    results.push({ suite: currentSuite, name, ok: true });
  } catch (error) {
    results.push({ suite: currentSuite, name, ok: false, error });
  }
}

/**
 * Queued assertion blocks that must run asynchronously.
 *
 * They execute in registration order when {@link runAsyncTests} is awaited, which
 * lets a suite register its whole scenario up front while still owning the lifetime
 * of the browser and server it drives.
 *
 * @type {Array<{ suite: string, name: string, fn: () => unknown }>}
 */
export const asyncSteps = [];

/** Maximum time a single queued block may run before it is reported as stalled. */
const TEST_TIMEOUT_MS = 60_000;

/**
 * Rejects if the supplied promise has not settled within `ms`.
 *
 * A browser-driven suite can otherwise stall forever on a single interaction; failing
 * loudly keeps the remaining blocks runnable and the report honest.
 *
 * @param {Promise<unknown>} promise work to await.
 * @param {number} ms timeout in milliseconds.
 * @param {string} label name reported in the timeout message.
 */
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${ms}ms: ${label}`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Queues an asynchronous assertion block under the current suite heading. */
export function testAsync(name, fn) {
  asyncSteps.push({ suite: currentSuite, name, fn });
}

/**
 * Runs every queued asynchronous block in registration order and records its result.
 *
 * Call this while the suite's fixtures are still alive, before tearing them down.
 *
 * @returns {Promise<void>} resolves once every queued block has settled.
 */
export async function runAsyncTests() {
  while (asyncSteps.length > 0) {
    const block = asyncSteps.shift();
    const startedAt = Date.now();
    process.stdout.write(`  ${DIM}running ${block.suite} :: ${block.name}${RESET}\n`);
    try {
      await withTimeout(block.fn(), TEST_TIMEOUT_MS, block.name);
      results.push({ suite: block.suite, name: block.name, ok: true });
    } catch (error) {
      results.push({ suite: block.suite, name: block.name, ok: false, error });
    }
    process.stdout.write(`  ${DIM}done    ${block.name} (${Date.now() - startedAt}ms)${RESET}\n`);
  }
}

/** Asserts strict deep equality between two JSON comparable values. */
export function assertEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\n      expected: ${expectedJson}\n      actual:   ${actualJson}`);
  }
}

/** Asserts strict equality of two primitive values. */
export function assertSame(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`);
  }
}

/** Asserts that `value` is truthy. */
export function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}\n      expected a truthy value but received: ${String(value)}`);
  }
}

/** Asserts that `value` is falsy. */
export function assertFalse(value, message) {
  if (value) {
    throw new Error(`${message}\n      expected a falsy value but received: ${String(value)}`);
  }
}

/**
 * Asserts that `haystack` matches `needle`.
 *
 * @param {string} haystack subject under inspection.
 * @param {string | RegExp} needle literal substring or regular expression the subject must match.
 * @param {string} message failure description.
 */
export function assertMatch(haystack, needle, message) {
  const matched =
    needle instanceof RegExp
      ? needle.test(String(haystack))
      : typeof haystack === 'string' && haystack.includes(needle);
  if (!matched) {
    throw new Error(`${message}\n      expected to match: ${needle}\n      actual: ${String(haystack)}`);
  }
}

/** Asserts that the callback throws, optionally matching the message. */
export function assertThrows(fn, message, expectedSubstring) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (!thrown) {
    throw new Error(`${message}\n      expected the call to throw but it returned normally`);
  }
  if (expectedSubstring && !String(thrown.message).includes(expectedSubstring)) {
    throw new Error(
      `${message}\n      expected message to contain: ${expectedSubstring}\n      actual: ${thrown.message}`,
    );
  }
  return thrown;
}

/**
 * Prints the report and terminates the process with the appropriate exit code.
 *
 * @param {string} suiteTitle headline shown at the end of the run.
 */
export function report(suiteTitle) {
  const failures = results.filter((result) => !result.ok);
  let lastSuite = null;

  for (const result of results) {
    if (result.suite !== lastSuite) {
      process.stdout.write(`\n${BOLD}${result.suite}${RESET}\n`);
      lastSuite = result.suite;
    }
    if (result.ok) {
      process.stdout.write(`  ${GREEN}PASS${RESET} ${DIM}${result.name}${RESET}\n`);
    } else {
      process.stdout.write(`  ${RED}FAIL${RESET} ${result.name}\n      ${String(result.error.message).replace(/\n/g, '\n      ')}\n`);
    }
  }

  const passed = results.length - failures.length;
  process.stdout.write(
    `\n${BOLD}${suiteTitle}${RESET} ${passed}/${results.length} assertions passed\n`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}