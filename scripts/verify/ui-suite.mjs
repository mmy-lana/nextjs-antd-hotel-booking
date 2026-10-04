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

  /* ------------------------------------------------------------------ */
  suite('Phase 2 — atomic UI primitives');

  testAsync('LuxuryPriceTag renders formatted currency with unit and comparison rate', async () => {
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="luxury-price-tag"]');

    const tags = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="luxury-price-tag"]')].map((node) => ({
        text: node.innerText.replace(/\s+/g, ' ').trim(),
        fontFamily: window.getComputedStyle(node.querySelector('.resort-display')).fontFamily,
      }));
    `);
    assertSame(tags.length, 4, 'every suite shows one price tag');
    // `innerText` reflects CSS `text-transform`, so the tracked prefix renders uppercase,
    // and it preserves the block line breaks between the typographic elements.
    assertEqual(
      tags[0].text.split('\n').map((line) => line.trim()).filter(Boolean),
      ['FROM', '$1,250', '$1,450', '/ night', 'Weekend rate \u00b7 280 m\u00b2 \u00b7 Panoramic Cliff'],
      'the tag renders prefix, rate, comparison rate, unit and note as distinct elements',
    );

    const amounts = tags.map((tag) => Number(tag.text.match(/\$([\d,]+)/)[1].replace(/,/g, '')));
    assertEqual(amounts, [1250, 980, 720, 2800], 'each suite renders its own base rate');

    for (const tag of tags) {
      assertMatch(tag.fontFamily, /Didot|Cormorant|Georgia|serif/i, 'prices use the display serif stack');
    }
  });

  testAsync('StatusBadge renders the shared room status vocabulary', async () => {
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="status-badge"]');

    const badges = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="status-badge"]')].map((node) => ({
        label: node.innerText.trim(),
        tone: node.dataset.tone,
        letterSpacing: window.getComputedStyle(node.querySelector('.ant-tag')).letterSpacing,
        uppercase: window.getComputedStyle(node.querySelector('.ant-tag')).textTransform,
      }));
    `);
    assertSame(badges.length, 4, 'every suite carries a status badge');
    for (const badge of badges) {
      assertMatch(badge.label, /^Available$/i, 'seeded suites are available');
      assertSame(badge.tone, 'success', 'available maps to the success tone');
      assertSame(badge.uppercase, 'uppercase', 'badge labels are set in small caps');
      assertTrue(Number.parseFloat(badge.letterSpacing) >= 0.6, 'badge labels carry tracked letter spacing');
    }
  });

  testAsync('AmenityIcon draws distinct stroke-only glyphs for every seeded amenity', async () => {
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="amenity-icon"]');

    const icons = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="amenity-icon"]')].map((node) => ({
        key: node.dataset.icon,
        paths: node.querySelectorAll('path').length,
        box: node.getBoundingClientRect().width,
        hidden: node.getAttribute('aria-hidden'),
        role: node.getAttribute('role'),
        strokeWidth: node.querySelector('path') ? window.getComputedStyle(node.querySelector('path')).strokeWidth : null,
      }));
    `);
    assertSame(icons.length, 11, 'each suite surfaces up to three amenity glyphs');

    const distinctGlyphs = [...new Set(icons.map((icon) => icon.key))].sort();
    assertEqual(
      distinctGlyphs,
      ['coffee', 'concierge', 'eye', 'fire', 'key', 'kitchen', 'lotus', 'ocean', 'pool', 'wine'],
      'every seeded amenity icon key resolves to its own hand-drawn glyph',
    );

    for (const icon of icons) {
      assertTrue(icon.paths > 0, `glyph ${icon.key} draws at least one path`);
      assertTrue(icon.box >= 12, `glyph ${icon.key} renders at a legible size`);
      assertSame(icon.hidden, 'true', 'decorative glyphs are hidden from assistive technology');
      assertSame(icon.role, null, 'decorative glyphs do not claim the img role');
      assertTrue(Number.parseFloat(icon.strokeWidth) > 0, `glyph ${icon.key} is stroked`);
    }
  });

  testAsync('SectionHeader renders the editorial eyebrow, serif title and lede', async () => {
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="section-header"]');

    const header = await page.evaluate(`
      const node = document.querySelector('[data-testid="section-header"]');
      const eyebrow = node.querySelector('.resort-eyebrow');
      const heading = node.querySelector('h1, h2, h3, h4');
      return {
        eyebrow: eyebrow ? eyebrow.innerText.trim() : null,
        headingLevel: heading ? heading.tagName.toLowerCase() : null,
        headingText: heading ? heading.innerText.trim() : null,
        headingFont: heading ? window.getComputedStyle(heading).fontFamily : null,
        eyebrowTransform: eyebrow ? window.getComputedStyle(eyebrow).textTransform : null,
        eyebrowSpacing: eyebrow ? window.getComputedStyle(eyebrow).letterSpacing : null,
        lede: node.querySelector('.resort-lede') ? node.querySelector('.resort-lede').innerText.trim() : null,
      };
    `);
    assertMatch(header.eyebrow, /^Architectural Sanctuaries$/i, 'the eyebrow label is rendered');
    assertSame(header.eyebrowTransform, 'uppercase', 'the eyebrow is uppercased');
    assertTrue(Number.parseFloat(header.eyebrowSpacing) >= 2, 'the eyebrow carries wide tracking');
    assertSame(header.headingLevel, 'h1', 'the hero uses a single h1');
    assertMatch(header.headingText, /^Curated Coastal Residences$/i, 'the hero title is rendered');
    assertMatch(header.headingFont, /Didot|Cormorant|Georgia|serif/i, 'headings use the display serif stack');
    assertMatch(header.lede, /cliffside seclusion/i, 'the lede paragraph is rendered');
  });

  testAsync('the design token layer drives the rendered palette', async () => {
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="luxury-price-tag"]');

    const tokens = await page.evaluate(`
      const styles = window.getComputedStyle(document.documentElement);
      const body = window.getComputedStyle(document.body);
      const antButton = document.querySelector('.ant-btn');
      return {
        bronze: styles.getPropertyValue('--resort-bronze').trim(),
        sand: styles.getPropertyValue('--resort-sand').trim(),
        bodyBackground: body.backgroundColor,
        bodyFont: body.fontFamily,
        buttonHeight: antButton ? Math.round(antButton.getBoundingClientRect().height) : 0,
      };
    `);
    assertSame(tokens.bronze, '#8c704b', 'the bronze accent token is published');
    assertSame(tokens.sand, '#faf8f5', 'the sand ground token is published');
    assertSame(tokens.bodyBackground, 'rgb(250, 248, 245)', 'the sand ground is applied to the page');
    assertMatch(tokens.bodyFont, /Plus Jakarta Sans/i, 'functional type uses the sans stack');
    assertTrue(tokens.buttonHeight >= 44, `buttons honour the 44px control height (got ${tokens.buttonHeight}px)`);
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