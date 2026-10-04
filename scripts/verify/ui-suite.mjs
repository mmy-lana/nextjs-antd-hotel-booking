/**
 * Headless Chrome UI verification suite.
 *
 * Runs against the real production build (`next build` output) served by
 * `next start`, in a headless Chrome instance with its own throwaway profile.
 *
 * Prerequisites: `pnpm run build`.
 */
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertEqual, assertFalse, assertMatch, assertSame, assertTrue, report, runAsyncTests, suite, testAsync } from './harness.mjs';
import { launchHeadlessChrome, closeAllPages, openPage, resolveChromeBinary } from './headless-chrome.mjs';
import { startNextServer } from './next-server.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, '.verify-screenshots');

if (!existsSync(path.join(PROJECT_ROOT, '.next', 'BUILD_ID'))) {
  process.stderr.write('A production build is required. Run "pnpm run build" first.\n');
  process.exit(1);
}
mkdirSync(SCREENSHOT_DIR, { recursive: true });

process.stdout.write(`Chrome binary: ${resolveChromeBinary()}\n`);
const server = await startNextServer();
process.stdout.write(`Next server:  ${server.origin}\n`);
const browser = await launchHeadlessChrome({ width: 1440, height: 900 });
process.stdout.write(`Headless CDP:  ${browser.endpoint}\n\n`);

let page = await openPage(browser.browserWsUrl);

/**
 * Routes that later phases of `plan.md` introduce.
 *
 * The App Router prefetches every `<Link>` target on hydration, so a scaffold link to a
 * route that a later phase still has to build produces an `?_rsc=` 404. Those prefetch
 * misses are tracked here so the suite can assert on everything that *is* implemented
 * while still failing loudly on a genuine broken link or script error. Each prefix is
 * removed from this list as soon as its phase lands.
 */
const PHASE_PLANNED_ROUTE_PREFIXES = ['/rooms/', '/admin/', '/booking/'];

/** @param {string} pathname route path, without its query string. */
function isPhasePlannedRoute(pathname) {
  return PHASE_PLANNED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Matches the RSC prefetch 404 noise emitted for not-yet-built routes. */
function isPlannedRoutePrefetchMiss({ text }) {
  if (!/\b404\b/.test(text)) {
    return false;
  }
  const url = /(https?:\/\/[^\s?]+|\/[^\s?]+)\?/.exec(text);
  if (!url) {
    return false;
  }
  return isPhasePlannedRoute(url[1].replace(/^https?:\/\/[^/]+/, ''));
}

/** Runs the body with diagnostics cleared, failing the test on any console error. */
async function checkPage(run, { label }) {
  page.resetDiagnostics();
  await run();
  const diagnostics = page.fatalDiagnostics(isPlannedRoutePrefetchMiss);
  assertEqual(diagnostics, [], `console must be clean on ${label}`);
}

try {
  /* ------------------------------------------------------------------ */
  suite('Application shell');

  testAsync('root document renders the resort shell', async () => {
    await checkPage(
      async () => {
        await page.goto(`${server.origin}/`);
        await page.waitForSelector('body');
      },
      { label: 'the guest landing page' },
    );

    const title = await page.evaluate('return document.title;');
    assertMatch(title, /Aura Cove Sanctuary/, 'the resort title is present');

    const bodyText = await page.evaluate('return document.body.innerText;');
    assertMatch(bodyText, 'AURA COVE', 'the resort wordmark is rendered');
    assertMatch(bodyText, 'Curated Coastal Residences', 'the landing headline is rendered');

    const language = await page.evaluate('return document.documentElement.lang;');
    assertSame(language, 'en', 'the document declares its language');
  });

  testAsync('the seeded catalogue is rendered from the inventory store', async () => {
    await checkPage(
      async () => {
        await page.goto(`${server.origin}/`);
        await page.waitForText('The Cliffside Sanctuary');
      },
      { label: 'the seeded catalogue' },
    );

    const bodyText = await page.evaluate('return document.body.innerText;');
    for (const title of [
      'The Cliffside Sanctuary',
      'Azure Lagoon Overwater Suite',
      'The Banyan Garden Pavilion',
      'The Celestial Penthouse',
    ]) {
      assertMatch(bodyText, title, `the catalogue lists ${title}`);
    }
    assertMatch(bodyText, '$1,250', 'the cliffside rate is displayed in USD');
    assertMatch(bodyText, '$2,800', 'the penthouse rate is displayed in USD');
  });

  testAsync('Ant Design styles are extracted through the SSR registry', async () => {
    const styledElements = await page.evaluate(
      "return document.querySelectorAll('[class*=\"ant-\"]').length;",
    );
    assertTrue(styledElements > 0, 'Ant Design components are styled on the first paint');
    const cssHrefCount = await page.evaluate(
      'return document.querySelectorAll("link[rel=stylesheet]").length;',
    );
    assertTrue(cssHrefCount > 0, 'stylesheet links are emitted by the App Router shell');
  });

  testAsync('room imagery is locked to a 4:3 aspect ratio', async () => {
    const ratios = await page.evaluate(`
      return [...document.querySelectorAll('img.room-card-media')]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return Math.round((rect.width / rect.height) * 100) / 100;
        });
    `);
    assertTrue(ratios.length > 0, 'at least one room image is rendered');
    for (const ratio of ratios) {
      assertTrue(Math.abs(ratio - 4 / 3) < 0.05, `image ratio ${ratio} honours the 4:3 lock`);
    }
  });

  testAsync('catalogue entries link to their suite pages', async () => {
    const hrefs = await page.evaluate(
      'return [...document.querySelectorAll("a[href^=\\"/rooms/\\"]")].map((node) => node.getAttribute("href"));',
    );
    assertTrue(hrefs.length > 0, 'the catalogue links to suite pages');
    assertTrue(
      hrefs.some((href) => href === '/rooms/the-cliffside-sanctuary'),
      'the cliffside villa links by its human-readable slug',
    );
    assertEqual(
      [...new Set(hrefs)].sort(),
      hrefs.sort(),
      'every catalogue entry resolves to a distinct suite page',
    );
  });

  testAsync('the staff console is reachable from the landing page', async () => {
    await checkPage(
      async () => {
        await page.goto(`${server.origin}/`);
        await page.waitForSelector('a[href="/admin/rooms"]');
      },
      { label: 'the landing navigation' },
    );
  });

  testAsync('every internal link is either live or scheduled for a later phase', async () => {
    await page.goto(`${server.origin}/`);
    await page.waitForText('The Cliffside Sanctuary');

    const probes = await page.probeInternalLinks();
    assertTrue(probes.length > 0, 'the landing page exposes internal navigation');

    const broken = probes.filter((probe) => probe.status >= 400 && !isPhasePlannedRoute(probe.href));
    assertEqual(broken, [], 'no implemented route returns an error status');
  });

  /* ------------------------------------------------------------------ */
  suite('Responsive shell — Phase 1 baseline');

  const VIEWPORTS = [
    { label: 'Mobile S 360', width: 360, height: 780, mobile: true },
    { label: 'Mobile M 390', width: 390, height: 844, mobile: true },
    { label: 'Mobile L 430', width: 430, height: 932, mobile: true },
    { label: 'Tablet 768', width: 768, height: 1024, mobile: true },
    { label: 'Desktop 1024', width: 1024, height: 768, mobile: false },
    { label: 'Desktop 1440', width: 1440, height: 900, mobile: false },
  ];

  for (const viewport of VIEWPORTS) {
    testAsync(`no horizontal overflow or clipping at ${viewport.label}`, async () => {
      await checkPage(
        async () => {
          await page.setViewport(viewport);
          await page.goto(`${server.origin}/`);
          await page.waitForText('The Cliffside Sanctuary');
        },
        { label: `the landing page at ${viewport.label}` },
      );

      const layout = await page.layoutReport();
      assertFalse(
        layout.horizontalOverflow,
        `the document must not scroll sideways at ${viewport.label} (scrollWidth ${layout.scrollWidth} vs ${layout.viewportWidth}); offenders: ${JSON.stringify(layout.overflowing)}`,
      );

      await page.screenshot(path.join(SCREENSHOT_DIR, `phase1-home-${viewport.width}.png`), { fullPage: false });
    });
  }

  testAsync('interactive controls meet the 44px touch target guideline on mobile', async () => {
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${server.origin}/`);
    await page.waitForText('The Cliffside Sanctuary');

    const undersized = await page.touchTargetReport(44);
    assertEqual(
      undersized,
      [],
      'every visible control on mobile must be at least 44x44 CSS pixels',
    );
  });

  testAsync('a 360px screenshot is captured for visual inspection', async () => {
    const file = path.join(SCREENSHOT_DIR, 'phase1-home-360.png');
    assertTrue(existsSync(file), 'the mobile screenshot was written to disk');
  });
  await runAsyncTests();
} finally {
  await page?.close().catch(() => {});
  await closeAllPages(browser.endpoint).catch(() => {});
  await browser.close();
  await server.stop();
}

await report('Headless Chrome UI suite');
process.stdout.write(`\nScreenshots written to ${SCREENSHOT_DIR}\n`);