/**
 * Side-effect module that installs a minimal browser environment **before** the
 * project modules are evaluated.
 *
 * Zustand's `persist` middleware resolves `window.localStorage` when the store is
 * created and, when no window exists, silently drops its rehydration API. Importing
 * this module first therefore gives the domain suite the same store surface the
 * application sees in a real browser.
 */
import { installMemoryStorage } from './dom-stub.mjs';

installMemoryStorage();