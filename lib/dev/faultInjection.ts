/**
 * Development-only fault injection.
 *
 * The App Router error boundaries can only be exercised by a component that genuinely
 * throws while rendering. This helper gives the verification suite one deterministic
 * trigger so the boundaries are proven rather than assumed.
 *
 * The guard is compiled out of production builds — `process.env.NODE_ENV` is inlined at
 * build time and the branch is eliminated — so a deployed application can never reach it.
 */

/** Session-storage flag that arms the fault. */
export const SEGMENT_FAULT_FLAG = 'aura_cove_force_segment_error';

/**
 * Throws when the fault flag is armed and the bundle is a development build.
 *
 * @throws {Error} when the suite has armed the flag.
 */
export function maybeInjectSegmentFault(): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  if (window.sessionStorage.getItem(SEGMENT_FAULT_FLAG) !== '1') {
    return;
  }
  throw new Error('Injected segment fault for error boundary verification');
}