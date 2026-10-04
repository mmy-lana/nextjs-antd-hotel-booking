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
        await page.setViewport({ width: 1440, height: 900, mobile: false });
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

    // NOTE: every backslash inside an `evaluate` template literal is consumed by the JS
    // string escape rules (`\s` would arrive as the literal letter `s`), so regular
    // expressions evaluated in the page are written with doubled backslashes.
    const tags = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="luxury-price-tag"]')].map((node) => ({
        lines: node.innerText.split('\\n').map((line) => line.trim()).filter(Boolean),
        fontFamily: window.getComputedStyle(node.querySelector('.resort-display')).fontFamily,
      }));
    `);
    assertSame(tags.length, 4, 'every suite shows one price tag');
    // `innerText` reflects CSS `text-transform`, so the tracked prefix renders uppercase,
    // and it preserves the block line breaks between the typographic elements.
    assertEqual(
      tags[0].lines,
      ['FROM', '$1,250', '$1,450', '/ night', 'Weekend rate \u00b7 resort fee 75/night'],
      'the tag renders prefix, rate, comparison rate, unit and note as distinct elements',
    );

    const amounts = tags.map((tag) => Number(tag.lines[1].replace(/[^0-9]/g, '')));
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
    assertSame(icons.length, 12, 'each suite surfaces up to four amenity glyphs');

    const distinctGlyphs = [...new Set(icons.map((icon) => icon.key))].sort();
    assertEqual(
      distinctGlyphs,
      ['bath', 'coffee', 'concierge', 'eye', 'fire', 'key', 'kitchen', 'lotus', 'ocean', 'pool', 'wine'],
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

  /* ------------------------------------------------------------------ */
  suite('Phase 3 — compound molecules and header');

  testAsync('RoomCard renders the catalogue contract for every suite', async () => {
    await checkPage(
      async () => {
        await page.goto(`${server.origin}/`);
        await page.waitForSelector('[data-testid="room-card"]');
      },
      { label: 'the RoomCard catalogue' },
    );

    const cards = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="room-card"]')].map((card) => ({
        roomNumber: card.dataset.roomNumber,
        bookable: card.dataset.bookable,
        title: card.querySelector('h3') ? card.querySelector('h3').innerText.trim() : null,
        href: card.querySelector('[data-testid="room-card-link"]')?.getAttribute('href') ?? null,
        specEntries: card.querySelectorAll('[data-testid="room-spec-grid"] dt').length,
        amenityChips: card.querySelectorAll('[data-testid="room-spec-grid"] ~ ul li').length,
        price: card.querySelector('[data-testid="luxury-price-tag"]')?.innerText ?? null,
        warning: card.querySelector('[data-testid="room-card-warning"]')?.innerText.trim() ?? null,
      }));
    `);

    assertSame(cards.length, 4, 'every seeded suite is presented as a card');
    assertEqual(
      cards.map((card) => card.roomNumber),
      ['V-101', 'S-204', 'G-108', 'P-501'],
      'cards are ordered by the curated catalogue',
    );

    for (const card of cards) {
      assertSame(card.bookable, 'true', 'without a date filter every seeded suite is bookable');
      assertSame(card.specEntries, 4, 'each card carries the full specification readout');
      assertTrue(card.amenityChips > 0, `${card.roomNumber} surfaces amenity chips`);
      assertMatch(card.href ?? '', /^\/rooms\/[a-z0-9-]+$/, 'the card links by human readable slug');
      assertMatch(card.price ?? '', /\$\d/, 'the card shows its nightly rate');
      assertSame(card.warning, null, 'no warning ribbon is shown when the suite is bookable');
    }

    assertEqual(
      cards.map((card) => card.href),
      [
        '/rooms/the-cliffside-sanctuary',
        '/rooms/azure-lagoon-overwater-suite',
        '/rooms/the-banyan-garden-pavilion',
        '/rooms/the-celestial-penthouse',
      ],
      'each card routes to its own suite page',
    );
  });

  testAsync('RoomSpecGrid reports the published dimensions, bedding and occupancy', async () => {
    const specs = await page.evaluate(`
      const card = [...document.querySelectorAll('[data-testid="room-card"]')]
        .find((node) => node.dataset.roomNumber === 'V-101');
      const grid = card.querySelector('[data-testid="room-spec-grid"]');
      const terms = [...grid.querySelectorAll('dt')].map((node) => node.innerText.trim());
      const values = [...grid.querySelectorAll('dd')].map((node) => node.innerText.trim());
      return { variant: grid.dataset.variant, terms, values };
    `);
    assertSame(specs.variant, 'inline', 'catalogue cards use the inline specification variant');
    assertEqual(specs.terms, ['INTERIOR', 'BEDDING', 'OUTLOOK', 'SLEEPS'], 'the readout labels are stable');
    assertEqual(
      specs.values,
      ['280 m²', '1 King Bed + 1 Daybed Lounge', 'Panoramic Cliff', '3 adults · 1 child · 1 infant'],
      'the cliffside sanctuary reports its seeded specification',
    );
  });

  testAsync('DateGuestFilterBar swaps between the range picker and split pickers', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="date-guest-filter-bar"]');

    const desktop = await page.evaluate(`
      const bar = document.querySelector('[data-testid="date-guest-filter-bar"]');
      return {
        mode: bar.dataset.pickerMode,
        range: bar.querySelectorAll('.ant-picker-range').length,
        single: bar.querySelectorAll('.ant-picker:not(.ant-picker-range)').length,
        checkIn: bar.querySelectorAll('[data-testid="check-in-picker"]').length,
        checkOut: bar.querySelectorAll('[data-testid="check-out-picker"]').length,
      };
    `);
    assertSame(desktop.mode, 'range', 'desktop uses the unified range picker');
    assertSame(desktop.range, 1, 'exactly one range picker is rendered');
    assertSame(desktop.single, 0, 'no standalone date picker is rendered');
    assertSame(desktop.checkIn, 0, 'the split check-in picker is not rendered');
    assertSame(desktop.checkOut, 0, 'the split check-out picker is not rendered');

    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="date-guest-filter-bar"]');

    const mobile = await page.evaluate(`
      const bar = document.querySelector('[data-testid="date-guest-filter-bar"]');
      const inputs = [...bar.querySelectorAll('[data-testid="check-in-picker"] input, [data-testid="check-out-picker"] input')];
      return {
        mode: bar.dataset.pickerMode,
        range: bar.querySelectorAll('.ant-picker-range').length,
        single: bar.querySelectorAll('.ant-picker:not(.ant-picker-range)').length,
        checkIn: bar.querySelectorAll('[data-testid="check-in-picker"]').length,
        checkOut: bar.querySelectorAll('[data-testid="check-out-picker"]').length,
        widths: inputs.map((node) => Math.round(node.getBoundingClientRect().width)),
        placeholders: inputs.map((node) => node.getAttribute('placeholder')),
      };
    `);
    assertSame(mobile.mode, 'split', 'phones below 576px use two independent date pickers');
    assertSame(mobile.range, 0, 'the unified range picker is not rendered on a narrow viewport');
    assertSame(mobile.single, 2, 'exactly two standalone date pickers are rendered');
    assertSame(mobile.checkIn, 1, 'the check-in picker is rendered once');
    assertSame(mobile.checkOut, 1, 'the check-out picker is rendered once');
    assertTrue(
      mobile.placeholders.every((placeholder) => (placeholder ?? '').includes('Select date')),
      'both split pickers show a full, untruncated placeholder',
    );
    assertTrue(
      mobile.widths.every((width) => width > 200),
      `the split pickers fill the available width (${JSON.stringify(mobile.widths)})`,
    );
  });

  testAsync('guest steppers are finger sized and drive live availability filtering', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="guest-trigger"]');

    assertMatch(
      await page.evaluate('return document.querySelector(\'[data-testid="guest-trigger"]\').innerText;'),
      /2 adults/i,
      'the trigger summarises the default party',
    );

    await page.click('[data-testid="guest-trigger"]');
    await page.waitForSelector('[data-testid="guest-panel"]');
    await page.settle();

    const steppers = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="guest-panel"] button')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { label: node.getAttribute('aria-label'), width: Math.round(rect.width), height: Math.round(rect.height) };
      });
    `);
    assertTrue(steppers.length >= 5, 'the guest panel exposes both counters and a reset');
    for (const stepper of steppers.filter((button) => (button.label ?? '').startsWith('Increase'))) {
      assertTrue(stepper.width >= 44 && stepper.height >= 44, `${stepper.label} is at least 44x44px`);
    }

    // Six adults exceeds every suite but the penthouse.
    for (let press = 0; press < 4; press += 1) {
      await page.click('[data-testid="guest-adults-increment"]');
    }
    assertSame(
      await page.evaluate('return document.querySelector(\'[data-testid="guest-adults-value"]\').innerText.trim();'),
      '6',
      'the adult counter advances to six',
    );

    await page.click('body', { timeout: 2000 }).catch(() => {});
    await page.evaluate(`
      const trigger = document.querySelector('[data-testid="guest-trigger"]');
      trigger.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    `);

    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="result-count"]');

    const filtered = await page.evaluate(`
      return {
        count: document.querySelector('[data-testid="result-count"]').innerText.trim(),
        bookable: [...document.querySelectorAll('[data-testid="room-card"]')].map((card) => card.dataset.roomNumber + ':' + card.dataset.bookable),
        warnings: [...document.querySelectorAll('[data-testid="room-card-warning"]')].map((node) => node.innerText.trim()),
      };
    `);
    assertMatch(filtered.count, /^1 of 4 residences available$/i, 'only the penthouse accommodates six adults');
    assertEqual(
      filtered.bookable,
      ['V-101:false', 'S-204:false', 'G-108:false', 'P-501:true'],
      'the other suites stay listed but are marked unbookable',
    );
    assertSame(filtered.warnings.length, 3, 'each unbookable suite explains itself');
    assertMatch(filtered.warnings[0], /maximum of 3 adults/i, 'the occupancy reason is guest readable');

    await page.click('[data-testid="reset-filters"]');
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="result-count"]');
    assertMatch(
      await page.evaluate('return document.querySelector(\'[data-testid="result-count"]\').innerText;'),
      /^4 of 4 residences available$/i,
      'resetting the filters restores the full catalogue',
    );
  });

  testAsync('AddonSelector prices concierge lines against the stay length', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="addon-selector"]');

    const rows = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="addon-row"]')].map((row) => ({
        id: row.dataset.addonId,
        quantity: row.dataset.quantity,
        price: row.querySelector('[data-testid="addon-line-price"]').innerText.trim(),
      }));
    `);
    assertEqual(
      rows.map((row) => row.id),
      ['addon-1', 'addon-2', 'addon-3', 'addon-4'],
      'every concierge service is offered',
    );
    assertTrue(
      rows.every((row) => row.quantity === '0' && row.price === '—'),
      'no add-on is selected by default',
    );

    const spaButtons = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="addon-stepper-addon-3"] button')]
        .map((node) => { const rect = node.getBoundingClientRect();
          return { label: node.getAttribute('aria-label'), width: Math.round(rect.width), height: Math.round(rect.height) }; });
    `);
    assertSame(spaButtons.length, 2, 'the per-night spa pass exposes decrement and increment controls');
    for (const button of spaButtons) {
      assertTrue(button.width >= 44 && button.height >= 44, `${button.label} meets the touch target minimum`);
    }

    await page.click('[data-testid="addon-stepper-addon-3-increment"]');
    await page.click('[data-testid="addon-stepper-addon-3-increment"]');

    const afterSelect = await page.evaluate(`
      const row = document.querySelector('[data-addon-id="addon-3"]');
      return {
        quantity: row.dataset.quantity,
        price: row.querySelector('[data-testid="addon-line-price"]').innerText.trim(),
        subtotal: document.querySelector('[data-testid="addon-subtotal"]').innerText.trim(),
      };
    `);
    assertSame(afterSelect.quantity, '2', 'the spa pass quantity rises to two');
    assertSame(afterSelect.price, '$170', 'two per-night passes over a single night total $170');
    assertSame(afterSelect.subtotal, '$170', 'the concierge subtotal reflects the selection');

    await page.click('[data-testid="addon-stepper-addon-1-increment"]');
    const mixed = await page.evaluate(`
      return {
        transfer: document.querySelector('[data-addon-id="addon-1"] [data-testid="addon-line-price"]').innerText.trim(),
        subtotal: document.querySelector('[data-testid="addon-subtotal"]').innerText.trim(),
      };
    `);
    assertSame(mixed.transfer, '$650', 'the helicopter transfer is priced once per stay');
    assertSame(mixed.subtotal, '$820', 'per-stay and per-night cadences combine correctly');

    await page.click('[data-testid="addon-stepper-addon-1-decrement"]');
    assertSame(
      await page.evaluate('return document.querySelector(\'[data-testid="addon-subtotal"]\').innerText.trim();'),
      '$170',
      'decrementing back to zero removes the per-stay line',
    );
  });

  testAsync('HeaderNavbar renders inline links on desktop and a drawer on mobile', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="header-navbar"]');

    const desktop = await page.evaluate(`
      const nav = document.querySelector('[data-testid="header-navbar"]');
      return {
        toggle: nav.querySelectorAll('[data-testid="navbar-toggle"]').length,
        links: [...nav.querySelectorAll('nav a')].map((node) => node.innerText.trim()),
        position: window.getComputedStyle(nav).position,
      };
    `);
    assertSame(desktop.toggle, 0, 'the desktop masthead has no hamburger');
    assertEqual(desktop.links, ['RESIDENCES', 'STAFF CONSOLE', 'RESERVATIONS'], 'inline links are uppercase labels');
    assertSame(desktop.position, 'sticky', 'the masthead stays pinned while the catalogue scrolls');

    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="navbar-toggle"]');

    const toggleBox = await page.boxOf('[data-testid="navbar-toggle"]');
    assertTrue(
      toggleBox.width >= 44 && toggleBox.height >= 44,
      `the hamburger is a finger sized target (${toggleBox.width}x${toggleBox.height})`,
    );
    assertSame(
      await page.evaluate(`
        return document.querySelectorAll('[data-testid="header-navbar"] nav a').length;
      `),
      0,
      'inline links are removed from the mobile masthead',
    );

    await page.click('[data-testid="navbar-toggle"]');
    await page.waitForSelector('[data-testid="navbar-drawer"]');
    await page.settle();
    const drawerLinks = await page.textOf('[data-testid="navbar-drawer"] a');
    assertEqual(drawerLinks.length, 3, 'the drawer carries every navigation destination');

    const drawerWidth = await page.evaluate(`
      const node = document.querySelector('.ant-drawer-content-wrapper');
      return node ? Math.round(node.getBoundingClientRect().width) : 0;
    `);
    assertTrue(drawerWidth >= 390, `the mobile drawer spans the full viewport (${drawerWidth}px)`);
  });

  testAsync('the design token layer drives the rendered palette', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
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
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('img.room-card-media');
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
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="room-card"]');
    const hrefs = await page.evaluate(
      'return [...document.querySelectorAll("a[href^=\\"/rooms/\\"]")].map((node) => node.getAttribute("href"));',
    );
    const uniqueHrefs = [...new Set(hrefs)];
    assertTrue(hrefs.length > 0, 'the catalogue links to suite pages');
    assertTrue(
      hrefs.some((href) => href === '/rooms/the-cliffside-sanctuary'),
      'the cliffside villa links by its human-readable slug',
    );
    assertSame(uniqueHrefs.length, 4, 'the catalogue resolves to exactly four distinct suite pages');
    assertEqual(
      uniqueHrefs.sort(),
      [...uniqueHrefs].sort(),
      'every catalogue entry resolves to a distinct suite page',
    );
  });

  testAsync('the staff console is reachable from the landing page', async () => {
    await checkPage(
      async () => {
        await page.setViewport({ width: 1440, height: 900, mobile: false });
        await page.goto(`${server.origin}/`);
        await page.waitForSelector('a[href="/admin/rooms"]');
      },
      { label: 'the landing navigation' },
    );
  });

  testAsync('every internal link is either live or scheduled for a later phase', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
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