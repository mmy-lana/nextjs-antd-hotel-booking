/**
 * Boots the production Next.js server for a headless verification run.
 *
 * The suite always exercises the real optimised build (`next build` output), never
 * the development server, so what is asserted is what ships.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {Promise<number>} an ephemeral TCP port that is currently free. */
export async function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts `next start` and waits until it answers an HTTP request.
 *
 * @param {object} [options]
 * @param {number} [options.port] port to bind; an ephemeral port is chosen when omitted.
 * @param {number} [options.readyTimeoutMs] milliseconds to wait for readiness.
 * @param {boolean} [options.dev] run `next dev` instead of `next start`. Development mode
 *   keeps Ant Design's deprecation warnings, which production builds strip.
 * @returns {Promise<{ origin: string, stop: () => Promise<void>, output: () => string }>} the running server handle.
 */
export async function startNextServer({ port, readyTimeoutMs = 90_000, dev = false } = {}) {
  const chosenPort = port ?? (await findFreePort());
  const origin = `http://127.0.0.1:${chosenPort}`;

  const child = spawn(
    path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next'),
    dev
      ? ['dev', '--hostname', '127.0.0.1', '--port', String(chosenPort)]
      : ['start', '--hostname', '127.0.0.1', '--port', String(chosenPort)],
    { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });

  const deadline = Date.now() + readyTimeoutMs;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited with code ${child.exitCode}.\n${output}`);
    }
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Not listening yet. */
    }
    await sleep(250);
  }

  if (!ready) {
    child.kill('SIGKILL');
    throw new Error(`next start did not become ready.\n${output}`);
  }

  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt += 1) {
        await sleep(100);
      }
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }
  };

  return { origin, stop, output: () => output };
}