/**
 * Node ESM resolution hook that maps the project's `@/*` TypeScript path alias
 * onto the real files on disk, so the pure domain logic can be exercised directly
 * by `node` without a bundler or a test framework.
 *
 * Usage:  node --import ./scripts/verify/register-aliases.mjs <script.mjs>
 */
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTENSION_CANDIDATES = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json'];

function resolveAliasTarget(aliasPath) {
  const base = path.join(PROJECT_ROOT, aliasPath);

  if (existsSync(base)) {
    const stats = statSync(base);
    if (stats.isFile()) {
      return base;
    }
    for (const extension of EXTENSION_CANDIDATES) {
      const indexFile = path.join(base, `index${extension}`);
      if (existsSync(indexFile)) {
        return indexFile;
      }
    }
    return null;
  }

  for (const extension of EXTENSION_CANDIDATES) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const target = resolveAliasTarget(specifier.slice(2));
      if (!target) {
        throw new Error(`Path alias "${specifier}" could not be resolved from ${PROJECT_ROOT}`);
      }
      return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
});