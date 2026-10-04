/**
 * Headless Chrome driver built directly on the Chrome DevTools Protocol.
 *
 * The launcher always passes `--headless` together with a throwaway `--user-data-dir`
 * under the OS temp directory, so an interactive browser session (including a
 * separately configured profile) is never attached to, shared with, or closed by
 * these runs.
 *
 * No third-party automation dependency is required: Node's built-in `WebSocket`
 * client speaks CDP directly. Sessions use the flattened multiplexing mode, with
 * one browser-level connection owning one attached page target.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 20_000;

/** Ordered list of Chrome binaries probed for a headless run. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

/**
 * Resolves the first available Chrome executable.
 *
 * @returns {string} absolute path to the Chrome binary.
 * @throws {Error} when no Chrome installation can be located.
 */
export function resolveChromeBinary() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `No Chrome binary found. Probed:\n  ${CHROME_CANDIDATES.join('\n  ')}\nSet CHROME_PATH to override.`,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts an isolated headless Chrome instance.
 *
 * @param {object} [options]
 * @param {number} [options.width] initial window width in CSS pixels.
 * @param {number} [options.height] initial window height in CSS pixels.
 * @returns {Promise<{ endpoint: string, browserWsUrl: string, close: () => Promise<void> }>} browser DevTools endpoint, WebSocket URL and shutdown function.
 */
export async function launchHeadlessChrome({ width = 1440, height = 900 } = {}) {
  const binary = resolveChromeBinary();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'aura-cove-chrome-'));

  const child = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--use-angle=swiftshader',
      '--in-process-gpu',
      '--disable-crash-reporter',
      '--disable-crashpad',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-dev-shm-usage',
      '--metrics-recording-only',
      '--mute-audio',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => {
    stderrBuffer += String(chunk);
  });

  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  let endpoint = null;

  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      rmSync(userDataDir, { recursive: true, force: true });
      throw new Error(`Chrome exited with code ${child.exitCode}.\n${stderrBuffer}`);
    }
    if (existsSync(portFile)) {
      const [firstLine] = readFileSync(portFile, 'utf8').split('\n');
      const port = Number(firstLine);
      if (Number.isFinite(port) && port > 0) {
        endpoint = `http://127.0.0.1:${port}`;
        break;
      }
    }
    await sleep(100);
  }

  if (!endpoint) {
    child.kill('SIGKILL');
    rmSync(userDataDir, { recursive: true, force: true });
    throw new Error(`Chrome did not expose a DevTools port in time.\n${stderrBuffer}`);
  }

  let version = null;
  for (let attempt = 0; attempt < 60 && !version; attempt += 1) {
    try {
      version = await (await fetch(`${endpoint}/json/version`)).json();
    } catch {
      await sleep(100);
    }
  }
  if (!version?.webSocketDebuggerUrl) {
    child.kill('SIGKILL');
    rmSync(userDataDir, { recursive: true, force: true });
    throw new Error(`Chrome did not publish a DevTools WebSocket URL.\n${stderrBuffer}`);
  }

  const close = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt += 1) {
        await sleep(100);
      }
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }
    rmSync(userDataDir, { recursive: true, force: true });
  };

  return { endpoint, browserWsUrl: version.webSocketDebuggerUrl, close };
}

/** JSON-RPC client over a DevTools WebSocket, supporting flattened sessions. */
class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (typeof message.id === 'number') {
        const entry = this.pending.get(message.id);
        if (!entry) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          entry.reject(new Error(`${message.method ?? 'cdp'}: ${message.error.message} (${message.error.code})`));
        } else {
          entry.resolve(message.result);
        }
        return;
      }
      const handlers = this.listeners.get(message.method);
      if (handlers) {
        for (const handler of handlers) {
          handler(message.params);
        }
      }
    });

    socket.addEventListener('close', () => {
      this.closed = true;
      for (const entry of this.pending.values()) {
        entry.reject(new Error('DevTools connection closed'));
      }
      this.pending.clear();
    });
  }

  /**
   * Issues a DevTools command.
   *
   * @param {string} method DevTools method name.
   * @param {object} [params] method parameters.
   * @param {string} [sessionId] attached session that owns the target.
   * @returns {Promise<object>} the command result.
   */
  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) {
        payload.sessionId = sessionId;
      }
      this.socket.send(JSON.stringify(payload));
    });
  }

  /** Subscribes to a DevTools event; returns an unsubscribe function. */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event).delete(handler);
  }
}

async function openSocket(url) {
  const socket = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error(`Cannot open a DevTools WebSocket at ${url}`)),
      { once: true },
    );
  });
  return socket;
}

/** A single navigable tab with console capture and responsive emulation. */
export class HeadlessPage {
  /**
   * @param {CdpConnection} connection browser-level DevTools connection.
   * @param {string} sessionId attached page session.
   * @param {string} targetId created target identifier.
   */
  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    /** @type {Array<{ level: string, text: string }>} */
    this.consoleEntries = [];
    /** @type {Array<{ level: string, text: string }>} */
    this.pageErrors = [];
  }

  /** Issues a page-scoped DevTools command. */
  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  /** Enables the CDP domains used by the suite and starts console capture. */
  async enable() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');

    this.connection.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error' && type !== 'warning' && type !== 'assert') {
        return;
      }
      const text = (args ?? [])
        .map((arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? '')
        .join(' ')
        .trim();
      this.consoleEntries.push({ level: type, text });
    });

    this.connection.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      this.pageErrors.push({
        level: 'exception',
        text:
          exceptionDetails?.exception?.description ??
          exceptionDetails?.text ??
          'Uncaught exception without a description',
      });
    });

    this.connection.on('Log.entryAdded', ({ entry }) => {
      if (entry.level !== 'error') {
        return;
      }
      this.pageErrors.push({ level: entry.level, text: `${entry.text} ${entry.url ?? ''}`.trim() });
    });

    await this.setViewport({ width: 1440, height: 900, mobile: false });
  }

  /**
   * Waits for mount animations to finish before a measurement is taken.
   *
   * Ant Design popovers and drawers animate with a transform scale, so a box measured
   * mid-animation reads a few pixels short. Layout assertions call this first.
   *
   * @param {number} [ms] milliseconds to allow the longest configured motion to settle.
   */
  async settle(ms = 600) {
    await sleep(ms);
  }

  /** Clears the captured console and error buffers. */
  resetDiagnostics() {
    this.consoleEntries = [];
    this.pageErrors = [];
  }

  /**
   * Collects fatal diagnostics captured since the last reset.
   *
   * @param {(entry: { level: string, text: string }) => boolean} [ignore] predicate identifying diagnostics to discard.
   * @returns {Array<{ level: string, text: string }>} console errors and uncaught exceptions.
   */
  fatalDiagnostics(ignore) {
    return [...this.pageErrors, ...this.consoleEntries].filter((entry) => {
      if (entry.level === 'warning') {
        return false;
      }
      if (/favicon\.ico/i.test(entry.text)) {
        return false;
      }
      if (/Download the React DevTools/i.test(entry.text)) {
        return false;
      }
      return ignore ? !ignore(entry) : true;
    });
  }

  /**
   * Fetches every internal link rendered in the document from inside the page origin.
   *
   * @returns {Promise<Array<{ href: string, status: number }>>} one entry per unique internal link.
   */
  async probeInternalLinks() {
    return this.evaluate(`
      const hrefs = [...new Set([...document.querySelectorAll('a[href]')]
        .map((node) => node.getAttribute('href'))
        .filter((href) => href && href.startsWith('/') && !href.startsWith('//')))];
      const results = [];
      for (const href of hrefs) {
        try {
          const response = await fetch(href, { method: 'GET', redirect: 'manual' });
          results.push({ href, status: response.status });
        } catch (error) {
          results.push({ href, status: 0, error: String(error) });
        }
      }
      return results;
    `);
  }

  /** Emulates a viewport, including touch-capable mobile widths. */
  async setViewport({ width, height, mobile = false, deviceScaleFactor = 1 }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: mobile,
      maxTouchPoints: mobile ? 5 : 1,
    });
  }

  /** Navigates and resolves once the load event has fired. */
  async goto(url, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out loading ${url}`));
      }, timeout);
      const off = this.connection.on('Page.loadEventFired', () => {
        clearTimeout(timer);
        off();
        resolve();
      });
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /**
   * Evaluates an expression in the page and returns its value.
   *
   * @param {string} expression JavaScript source evaluated in the page realm.
   * @returns {Promise<unknown>} the serialised result.
   */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `Page evaluation failed: ${
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
        }`,
      );
    }
    return result.result?.value;
  }

  /**
   * Polls until the selector matches at least one element.
   *
   * @param {string} selector CSS selector.
   * @param {object} [options]
   * @param {number} [options.timeout] milliseconds to wait before failing.
   * @param {boolean} [options.visible] require a non-zero box when true.
   * @returns {Promise<boolean>} `true` once the element is present.
   */
  async waitForSelector(selector, { timeout = DEFAULT_TIMEOUT_MS, visible = false } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const found = await this.evaluate(`
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) { return false; }
        ${visible ? 'const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;' : 'return true;'}
      `);
      if (found) {
        return true;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  /** Waits until the rendered document contains the supplied text. */
  async waitForText(text, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const present = await this.evaluate(
        `return document.body ? document.body.innerText.includes(${JSON.stringify(text)}) : false;`,
      );
      if (present) {
        return true;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for text: ${text}`);
  }

  /** Waits until the document no longer contains the supplied text. */
  async waitForTextToDisappear(text, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const present = await this.evaluate(
        `return document.body ? document.body.innerText.includes(${JSON.stringify(text)}) : false;`,
      );
      if (!present) {
        return true;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for text to disappear: ${text}`);
  }

  /** Reads the trimmed inner text of every match, in document order. */
  textOf(selector) {
    return this.evaluate(`
      return [...document.querySelectorAll(${JSON.stringify(selector)})].map((node) => node.innerText.trim());
    `);
  }

  /** Counts the elements matched by a selector. */
  countOf(selector) {
    return this.evaluate(
      `return document.querySelectorAll(${JSON.stringify(selector)}).length;`,
    );
  }

  /** Returns the bounding box of the first match, or `null` when absent. */
  boxOf(selector) {
    return this.evaluate(`
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) { return null; }
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    `);
  }

  /** Scrolls an element into the middle of the viewport before interaction. */
  async scrollIntoView(selector) {
    await this.evaluate(`
      const node = document.querySelector(${JSON.stringify(selector)});
      if (node) { node.scrollIntoView({ block: 'center', inline: 'center' }); }
      return true;
    `);
    await sleep(80);
  }

  /** Clicks the first match with real trusted mouse events. */
  async click(selector, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    await this.waitForSelector(selector, { timeout, visible: true });
    await this.scrollIntoView(selector);
    const box = await this.boxOf(selector);
    if (!box || box.width === 0 || box.height === 0) {
      throw new Error(`Element is not clickable: ${selector}`);
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(150);
  }

  /**
   * Focuses a field and types the supplied text using real input events.
   *
   * @param {string} selector CSS selector for the input, textarea or contenteditable node.
   * @param {string} text value to type, replacing any existing content.
   */
  async type(selector, text) {
    await this.waitForSelector(selector);
    await this.scrollIntoView(selector);
    await this.click(selector);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 4,
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      modifiers: 4,
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
    });
    await this.send('Input.insertText', { text });
    await sleep(150);
  }

  /** Presses a single key by its `KeyboardEvent.key` value. */
  async pressKey(key, { code, keyCode } = {}) {
    const base = {
      key,
      code: code ?? `Key${key.toUpperCase()}`,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(150);
  }

  /** Measures the document for horizontal overflow and off-canvas content. */
  layoutReport() {
    return this.evaluate(`
      const doc = document.documentElement;
      const viewportWidth = doc.clientWidth;
      const overflowing = [...document.querySelectorAll('body *')]
        .filter((node) => {
          const style = window.getComputedStyle(node);
          if (style.position === 'fixed' || style.display === 'none') { return false; }
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && (rect.right > viewportWidth + 1 || rect.left < -1);
        })
        .slice(0, 8)
        .map((node) => ({
          tag: node.tagName.toLowerCase(),
          className: typeof node.className === 'string' ? node.className.slice(0, 80) : '',
          right: Math.round(node.getBoundingClientRect().right),
        }));
      return {
        viewportWidth,
        scrollWidth: doc.scrollWidth,
        horizontalOverflow: doc.scrollWidth > viewportWidth + 1,
        overflowing,
      };
    `);
  }

  /** Measures interactive controls that fall below the touch-target guideline. */
  touchTargetReport(minimum = 44) {
    return this.evaluate(`
      const minimum = ${Number(minimum)};
      const selectors = 'button, a[href], [role="button"], [role="tab"], input, select, textarea, .ant-checkbox-wrapper, .ant-radio-button-wrapper, .ant-picker, .ant-select-selector';
      return [...document.querySelectorAll(selectors)]
        .filter((node) => {
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') { return false; }
          if (node.closest('[aria-hidden="true"]')) { return false; }
          // Bare inputs nested inside a composite control (picker, select, number field)
          // are not the touch target themselves; the wrapper around them is.
          if (node.matches('input, textarea, select') && node.closest('.ant-picker, .ant-select, .ant-input-number, .ant-input-affix-wrapper')) { return false; }
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            tag: node.tagName.toLowerCase(),
            label: (node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || '').trim().slice(0, 40),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((entry) => entry.height < minimum || entry.width < minimum);
    `);
  }

  /** Reads the value of every matched input, in document order. */
  valuesOf(selector) {
    return this.evaluate(`
      return [...document.querySelectorAll(${JSON.stringify(selector)})].map((node) => node.value ?? null);
    `);
  }

  /** Captures a PNG screenshot of the current viewport. */
  async screenshot(filePath, { fullPage = false } = {}) {
    const params = { format: 'png' };
    if (fullPage) {
      params.captureBeyondViewport = true;
      const metrics = await this.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize ?? metrics.contentSize;
      params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
    }
    const { data } = await this.send('Page.captureScreenshot', params);
    writeFileSync(filePath, Buffer.from(data, 'base64'));
    return filePath;
  }

  /** Detaches and destroys the page target. */
  async close() {
    try {
      await this.connection.send('Target.closeTarget', { targetId: this.targetId });
    } catch {
      /* The browser may already be gone. */
    }
  }
}

/**
 * Creates a tab and attaches to it through a browser-level DevTools connection.
 *
 * @param {string} browserWsUrl the browser WebSocket endpoint from `/json/version`.
 * @returns {Promise<HeadlessPage>} a ready-to-use page.
 */
export async function openPage(browserWsUrl) {
  const socket = await openSocket(browserWsUrl);
  const connection = new CdpConnection(socket);

  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  const page = new HeadlessPage(connection, sessionId, targetId);
  await page.enable();
  return page;
}

/** Closes every tab opened during a run. */
export async function closeAllPages(endpoint) {
  try {
    const targets = await (await fetch(`${endpoint}/json/list`)).json();
    for (const target of targets) {
      if (target.type === 'page') {
        await fetch(`${endpoint}/json/close/${target.id}`).catch(() => {});
      }
    }
  } catch {
    /* The browser is already shutting down. */
  }
}

export { sleep };