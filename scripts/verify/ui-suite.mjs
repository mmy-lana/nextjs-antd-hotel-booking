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

const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';
import dayjs from 'dayjs';

import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';

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
let browser = await launchHeadlessChrome({ width: 1440, height: 900 });
process.stdout.write(`Headless CDP:  ${browser.endpoint}\n\n`);

let page = await openPage(browser.browserWsUrl);

/**
 * Replaces the active tab with a brand new one.
 *
 * Every assertion starts from a clean document and a clean storage snapshot, so a test
 * can never inherit a drawer, a stale store mutation or a broken layout from its
 * predecessor. The browser itself is reused, which keeps the run fast.
 */
async function freshPage() {
  await page?.close().catch(() => {});

  // The browser is relaunched transparently if a previous interaction left it wedged,
  // so one bad run cannot invalidate every assertion that follows it.
  try {
    const probe = await fetch(`${browser.endpoint}/json/version`, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok) {
      throw new Error(`DevTools endpoint responded ${probe.status}`);
    }
    page = await openPage(browser.browserWsUrl);
  } catch (error) {
    process.stdout.write(`  ${DIM}relaunching headless Chrome after: ${error.message}${RESET}\n`);
    process.stdout.write(`  ${DIM}${browser.diagnostics()}${RESET}\n`);
    await browser.close().catch(() => {});
    browser = await launchHeadlessChrome({ width: 1440, height: 900 });
    page = await openPage(browser.browserWsUrl);
  }
  return page;
}

/**
 * Route prefixes that are knowingly absent.
 *
 * The App Router prefetches every `<Link>` target on hydration, so a link to a route a
 * later phase still has to build produces an `?_rsc=` 404. Those prefetch misses are
 * tracked here so the suite can assert on everything that *is* implemented while still
 * failing loudly on a genuine broken link or script error. Each prefix is added as its
 * phase introduces the link and removed once the route exists.
 */
const PHASE_PLANNED_ROUTE_PREFIXES = [];

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
async function checkPage(run, { label, allowStatuses = [] }) {
  page.resetDiagnostics();
  await run();
  const isExpected = (entry) => {
    const status = /status of (\d{3})/.exec(entry.text)?.[1];
    return status !== undefined && allowStatuses.includes(status);
  };
  const diagnostics = page
    .fatalDiagnostics(isPlannedRoutePrefetchMiss)
    .filter((entry) => !isExpected(entry));
  assertEqual(diagnostics, [], `console must be clean on ${label}`);
}

/**
 * Drives the Ant Design date pickers inside the booking drawer.
 *
 * Dates are chosen by clicking real calendar cells rather than typing, which exercises
 * the same code path a guest uses. The picker panel is re-queried after each click
 * because Ant Design re-renders it between the arrival and departure selections.
 */
async function selectStayDates(page, arrivalIso, departureIso) {
  const arrival = dayjs(arrivalIso);
  const departure = dayjs(departureIso);
  const targetMonth = arrival.format('MMMM YYYY');

  /** Reads the month currently rendered in the open calendar header. */
  const displayedMonth = () =>
    page.evaluate(`
      const dropdown = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
      const title = dropdown && dropdown.querySelector('.ant-picker-header-view');
      return title ? title.textContent.trim() : null;
    `);

  /** Steps the calendar forward until the target month is on screen (bounded). */
  const revealTargetMonth = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const shown = await displayedMonth();
      if (shown === targetMonth) {
        return;
      }
      const advanced = await page.evaluate(`
        const dropdown = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
        const next = dropdown.querySelector('.ant-picker-next-month-btn');
        if (!next) { return false; }
        next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      `);
      if (!advanced) {
        return;
      }
      await page.settle(350);
    }
  };

  const openPicker = async (testId) => {
    await page.click(`[data-testid="${testId}"]`);
    await page.waitForSelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
    await page.settle(400);
    await revealTargetMonth();
  };

  const choose = async (iso) => {
    const cell = `.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td[title="${iso}"]`;
    await page.waitForSelector(cell, { timeout: 5000 });
    await page.click(cell);
    await page.settle(400);
  };

  await openPicker('booking-check-in');
  await choose(arrivalIso);

  await openPicker('booking-check-out');
  await revealTargetMonth();
  await choose(departureIso);
}

/**
 * Picks the next Friday at least two weeks out, then the Monday three nights later.
 *
 * The booking calendar refuses past dates, so the suite derives a real future window
 * that is guaranteed to contain two weekend nights (Friday and Saturday) and one
 * weekday night (Sunday), which makes the expected folio deterministic.
 */
function futureWeekendWindow() {
  let arrival = dayjs().startOf('day').add(14, 'day');
  while (arrival.day() !== 5) {
    arrival = arrival.add(1, 'day');
  }
  return { arrival: arrival.format('YYYY-MM-DD'), departure: arrival.add(3, 'day').format('YYYY-MM-DD') };
}

const STAY = futureWeekendWindow();

/**
 * Marks the current tab as an authorised staff session.
 *
 * `sessionStorage` is scoped to one tab, so a freshly opened page has to authorise
 * itself before it can reach the console — exactly as a real staff member would.
 *
 * @param {object} page active headless page, already navigated to the app origin.
 */
async function authoriseStaff(page) {
  await page.evaluate(`
    window.sessionStorage.setItem('aura_cove_staff_session', 'active');
    return true;
  `);
}

/**
 * Rewrites the browser's persisted stores to a known snapshot.
 *
 * Scenarios share one browser profile, so an itinerary created by an earlier scenario
 * would otherwise make a later one flaky. Seeding explicitly keeps every assertion
 * independent of the order the suite happens to run in.
 *
 * @param {object} page active headless page.
 * @param {unknown[]} [reservations] itineraries the scenario starts with.
 */
async function resetInventory(page, reservations = []) {
  await page.goto(`${server.origin}/`);
  await page.evaluate(`
    const rooms = ${JSON.stringify(defaultRooms)};
    const addons = ${JSON.stringify(defaultAddons)};
    window.localStorage.clear();
    window.sessionStorage.setItem('aura_cove_staff_session', 'active');
    window.localStorage.setItem('resort-inventory-storage', JSON.stringify({
      state: { rooms, reservations: ${JSON.stringify(reservations)}, addons },
      version: 0,
    }));
    window.localStorage.setItem('resort-search-session', JSON.stringify({
      state: { dateRange: null, guests: { adults: 2, children: 0 }, selectedCategory: 'ALL' },
      version: 0,
    }));
    return true;
  `);
}

/** Opens the booking drawer for a suite on a freshly loaded catalogue. */
async function openBookingDrawer(page, roomNumber) {
  await page.goto(`${server.origin}/`);
  await page.waitForSelector(`[data-room-number="${roomNumber}"]`);
  await page.click(`[data-room-number="${roomNumber}"] [data-testid="room-card-reserve"]`);
  await page.waitForSelector('[data-testid="booking-drawer"]');
  await page.settle();
}

/** Fills the guest details form with a complete, valid record. */
async function completeGuestForm(page) {
  await page.type('[data-testid="booking-email"]', 'amelia.hartwell@example.com');
  await page.type('[data-testid="booking-first-name"]', 'Amelia');
  await page.type('[data-testid="booking-last-name"]', 'Hartwell');
  await page.type('[data-testid="booking-phone"]', '+1 555 0142');
  await page.settle();
}

/**
 * Drives a complete reservation through the real guest flow and returns its reference.
 *
 * Later scenarios reuse this so every assertion starts from a guaranteed itinerary
 * instead of depending on whichever test happened to run before it.
 */
async function createReservationThroughUi(page, roomNumber = 'V-101') {
  await openBookingDrawer(page, roomNumber);
  await selectStayDates(page, STAY.arrival, STAY.departure);
  await page.settle();
  await completeGuestForm(page);
  await page.click('[data-testid="booking-submit"]');
  await page.settle(1500);
  const reference = await page.evaluate(`
    const raw = window.localStorage.getItem('resort-inventory-storage');
    const reservations = (raw ? JSON.parse(raw) : { state: { reservations: [] } }).state.reservations;
    return reservations.length > 0 ? reservations[0].bookingReference : '';
  `);
  if (!reference) {
    throw new Error('The reservation was not persisted, so the scenario has no precondition');
  }
  return reference;
}

/** The viewport matrix every responsive assertion sweeps. */
const VIEWPORTS = [
  { label: 'Mobile S 360', width: 360, height: 780, mobile: true },
  { label: 'Mobile M 390', width: 390, height: 844, mobile: true },
  { label: 'Mobile L 430', width: 430, height: 932, mobile: true },
  { label: 'Tablet 768', width: 768, height: 1024, mobile: true },
  { label: 'Desktop 1024', width: 1024, height: 768, mobile: false },
  { label: 'Desktop 1440', width: 1440, height: 900, mobile: false },
];

try {
  /* ------------------------------------------------------------------ */
  suite('Application shell');

  testAsync('root document renders the resort shell', async () => {
    await freshPage();
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
    await freshPage();
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
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="luxury-price-tag"]');

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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-room-number="V-101"]');

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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="header-navbar"]');
    // `Grid.useBreakpoint()` resolves through matchMedia after hydration.
    await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15_000 });

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
    await page.settle();

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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
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
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForText('The Cliffside Sanctuary');

    const probes = await page.probeInternalLinks();
    assertTrue(probes.length > 0, 'the landing page exposes internal navigation');

    const broken = probes.filter((probe) => probe.status >= 400 && !isPhasePlannedRoute(probe.href));
    assertEqual(broken, [], 'no implemented route returns an error status');
  });

  /* ------------------------------------------------------------------ */
  suite('Phase 4 — booking flow');

  testAsync('the booking drawer quotes an itemised total that recalculates live', async () => {
    await freshPage();
    await resetInventory(page);
    await checkPage(
      async () => {
        await page.setViewport({ width: 1440, height: 900, mobile: false });
        await openBookingDrawer(page, 'V-101');
      },
      { label: 'the booking drawer' },
    );

    const empty = await page.evaluate(`
      return document.querySelector('[data-testid="booking-drawer"]').innerText;
    `);
    assertMatch(empty, /Select arrival and departure dates/i, 'the drawer asks for a stay window before quoting');
    assertTrue(
      await page.evaluate(`return document.querySelector('[data-testid="booking-submit"]').disabled;`),
      'submission is blocked until a quote exists',
    );

    // A Friday to Monday stay bills one weekday night and two weekend nights.
    await selectStayDates(page, STAY.arrival, STAY.departure);
    await page.settle();

    const quote = await page.evaluate(`
      const drawer = document.querySelector('[data-testid="booking-drawer"]');
      return {
        folio: [...drawer.querySelectorAll('dt, dd')].map((node) => node.innerText.trim()),
        total: drawer.querySelector('[data-testid="booking-grand-total"]').innerText.trim(),
        conflict: Boolean(drawer.querySelector('[data-testid="booking-conflict"]')),
      };
    `);
    assertFalse(quote.conflict, 'a free window produces no conflict notice');
    // 1 x $1,250 + 2 x $1,450 + 3 x $75 resort fee + $150 cleaning = $4,525 subtotal.
    // 10% service charge rounds to $453 and 8% occupancy tax to $362, for $5,340 total.
    assertEqual(
      quote.folio.filter((line) => line.startsWith('$')),
      ['$1,250', '$2,900', '$225', '$150', '$453', '$362', '$5,340'],
      'the folio itemises weekday, weekend, resort fee, cleaning, service charge and tax',
    );
    assertMatch(quote.total, /\$5,340/, 'the grand total matches the pricing engine');

    // Two per-night spa passes over three nights add 2 x $85 x 3 = $510 to the subtotal,
    // which moves the grand total to $5,942.
    const drawerAddon = '[data-testid="booking-drawer"] [data-testid="addon-stepper-addon-3-increment"]';
    await page.click(drawerAddon);
    await page.click(drawerAddon);
    await page.settle();

    const updated = await page.evaluate(`
      return document.querySelector('[data-testid="booking-grand-total"]').innerText.trim();
    `);
    assertMatch(updated, /\$5,942/, 'adding two nightly spa passes recalculates the quote');
  });

  testAsync('guest validation runs inline and blocks submission', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await openBookingDrawer(page, 'S-204');
    await selectStayDates(page, STAY.arrival, STAY.departure);
    await page.settle();

    await page.click('[data-testid="booking-submit"]');
    await page.settle();

    const errors = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="booking-drawer"] .ant-form-item-explain-error')]
        .map((node) => node.innerText.trim());
    `);
    assertTrue(errors.length >= 4, 'submitting an empty form reports one message per required field');
    assertTrue(
      errors.some((message) => /at least 2 characters/i.test(message)),
      'the first name rule mirrors the Zod schema',
    );
    assertTrue(
      errors.some((message) => /valid guest email address/i.test(message)),
      'the email rule mirrors the Zod schema',
    );
    assertTrue(
      errors.some((message) => /concierge/i.test(message)),
      'the phone rule mirrors the Zod schema',
    );

    await page.type('[data-testid="booking-email"]', 'not-an-email');
    await page.settle();
    assertTrue(
      await page.evaluate(`
        const item = document.querySelector('[data-testid="booking-email"]').closest('.ant-form-item');
        return Boolean(item.querySelector('.ant-form-item-explain-error'));
      `),
      'an invalid email is rejected while typing',
    );

    await completeGuestForm(page);
    const remaining = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="booking-drawer"] .ant-form-item-explain-error')]
        .map((node) => node.innerText.trim());
    `);
    assertEqual(remaining, [], 'a complete guest record clears every inline error');
  });

  testAsync('a confirmed reservation is persisted with an itemised quote', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await openBookingDrawer(page, 'V-101');
    await selectStayDates(page, STAY.arrival, STAY.departure);
    await page.settle();

    const drawerAddon = '[data-testid="booking-drawer"] [data-testid="addon-stepper-addon-3-increment"]';
    await page.click(drawerAddon);
    await page.click(drawerAddon);
    await completeGuestForm(page);

    await page.click('[data-testid="booking-submit"]');
    await page.settle(1500);

    // Checkout redirects to the itinerary pass, so the persisted store is the
    // authoritative record that the reservation completed.
    const stored = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      const parsed = raw ? JSON.parse(raw) : null;
      const reservation = parsed && parsed.state && parsed.state.reservations[0];
      return reservation ? {
        reference: reservation.bookingReference,
        status: reservation.status,
        payment: reservation.paymentStatus,
        roomId: reservation.roomId,
        grandTotal: reservation.pricing.grandTotal,
        taxes: reservation.pricing.taxesTotal,
        addonTotal: reservation.pricing.addonsSubtotal,
        guestId: reservation.guest.guestId,
      } : null;
    `);

    assertTrue(stored !== null, 'the itinerary is written to localStorage');
    assertMatch(stored.reference, /^RES-[0-9A-F]{10}$/, 'the booking reference uses the documented format');
    assertSame(stored.status, 'CONFIRMED', 'a completed checkout confirms the itinerary');
    assertSame(stored.payment, 'PAID', 'the folio is settled at confirmation');
    assertSame(stored.grandTotal, 5942, 'the persisted grand total matches the quoted amount');
    assertSame(stored.taxes, 907, 'service charge and occupancy tax are itemised separately');
    assertSame(stored.addonTotal, 510, 'the two nightly spa passes are captured at $510');
    assertMatch(stored.guestId, /^guest-[0-9a-f]{8}$/, 'a returning-guest fingerprint is stored');
  });

  testAsync('the drawer reports a conflict when the dates are already reserved', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await createReservationThroughUi(page, 'G-108');

    await openBookingDrawer(page, 'G-108');
    await selectStayDates(page, STAY.arrival, STAY.departure);
    await page.settle();

    const conflict = await page.evaluate(`
      const node = document.querySelector('[data-testid="booking-conflict"]');
      return node ? node.innerText.trim() : null;
    `);
    assertTrue(conflict !== null, 'reserving the same window twice raises a conflict notice');
    assertMatch(conflict, /already reserved/i, 'the conflict explains what happened');
    assertTrue(
      await page.evaluate(`return document.querySelector('[data-testid="booking-submit"]').disabled;`),
      'a conflicting window cannot be submitted',
    );
  });

  testAsync('a suite in maintenance cannot be reserved', async () => {
    await freshPage();
    await resetInventory(page);
    await page.goto(`${server.origin}/admin/rooms`);
    await page.waitForSelector('[data-testid="room-inventory-table"]');

    await page.evaluate(`
      const select = document.querySelector('[data-testid="status-select-V-101"]');
      return true;
    `);
    await page.click('[data-testid="status-select-V-101"]');
    await page.waitForSelector('.ant-select-item-option');
    await page.settle();
    await page.evaluate(`
      const option = [...document.querySelectorAll('.ant-select-item-option')]
        .find((node) => node.innerText.trim().toLowerCase() === 'maintenance');
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    `);
    await page.settle();

    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-room-number="V-101"]');

    const cardState = await page.evaluate(`
      const card = document.querySelector('[data-room-number="V-101"]');
      return {
        status: card.querySelector('[data-testid="status-badge"]').innerText.trim(),
        reserveDisabled: card.querySelector('[data-testid="room-card-reserve"]').disabled,
      };
    `);
    assertMatch(cardState.status, /^maintenance$/i, 'the catalogue reflects the new status');
    assertTrue(cardState.reserveDisabled, 'a suite in maintenance cannot be reserved from the catalogue');
  });

  /* ------------------------------------------------------------------ */
  suite('Phase 4 — admin inventory');

  testAsync('the inventory table scrolls instead of reflowing on mobile', async () => {
    await freshPage();
    await resetInventory(page);
    await checkPage(
      async () => {
        await page.setViewport({ width: 390, height: 844, mobile: true });
        await page.goto(`${server.origin}/admin/rooms`);
        await page.waitForSelector('.ant-table-content');
      },
      { label: 'the room inventory table at 390px' },
    );
    await page.settle();

    const table = await page.evaluate(`
      const wrapper = document.querySelector('.admin-table-container');
      const content = document.querySelector('.ant-table-content');
      return {
        overflowX: window.getComputedStyle(wrapper).overflowX,
        clientWidth: Math.round(wrapper.clientWidth),
        scrollWidth: Math.round(content.scrollWidth),
        viewport: document.documentElement.clientWidth,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    `);
    assertSame(table.overflowX, 'auto', 'the table container scrolls horizontally');
    assertTrue(table.scrollWidth >= 900, `the table reserves its 900px minimum width (${table.scrollWidth}px)`);
    assertFalse(table.documentOverflow, 'the page itself never scrolls sideways');

    const layout = await page.layoutReport();
    assertFalse(layout.horizontalOverflow, 'no element escapes the viewport at 390px');

    const actionTargets = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid^="edit-room-"], [data-testid="add-room"]')]
        .map((node) => { const rect = node.getBoundingClientRect();
          return { id: node.dataset.testid, width: Math.round(rect.width), height: Math.round(rect.height) }; });
    `);
    assertTrue(actionTargets.length > 0, 'row actions are reachable on mobile');
    for (const target of actionTargets) {
      assertTrue(target.height >= 44, `${target.id} keeps a 44px touch height`);
    }
  });

  testAsync('inline status and rate edits persist in the inventory store', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/admin/rooms`);
    await page.waitForSelector('[data-testid="room-inventory-table"]');

    await page.fill('[data-testid="base-rate-G-108"]', 777);

    await page.click('[data-testid="status-select-P-501"]');
    await page.waitForSelector('.ant-select-item-option');
    await page.settle();
    await page.evaluate(`
      const option = [...document.querySelectorAll('.ant-select-item-option')]
        .find((node) => node.innerText.trim().toLowerCase() === 'cleaning');
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    `);
    await page.settle();

    const persisted = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      const rooms = (raw ? JSON.parse(raw) : {}).state.rooms;
      const garden = rooms.find((room) => room.roomNumber === 'G-108');
      const penthouse = rooms.find((room) => room.roomNumber === 'P-501');
      return { baseRate: garden.basePricePerNight, penthouseStatus: penthouse.status };
    `);
    assertSame(persisted.baseRate, 777, 'the inline rate edit is written through to storage');
    assertSame(persisted.penthouseStatus, 'CLEANING', 'the inline status change is written through to storage');
  });

  testAsync('the room editor validates against the Zod schema', async () => {
    await freshPage();
    await resetInventory(page);
    await page.goto(`${server.origin}/admin/rooms`);
    await page.waitForSelector('[data-testid="room-inventory-table"]');

    await page.click('[data-testid="add-room"]');
    await page.waitForSelector('[data-testid="room-editor-modal"]');
    await page.settle();

    await page.click('.ant-modal-footer .ant-btn-primary');
    await page.settle();

    const errors = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="room-editor-modal"] .ant-form-item-explain-error')]
        .map((node) => node.innerText.trim());
    `);
    assertTrue(errors.length > 0, 'an empty suite form is rejected');
    assertTrue(errors.some((message) => /room number is mandatory/i.test(message)), 'the room number is required');
    assertTrue(errors.some((message) => /at least 3 characters/i.test(message)), 'the title length rule is enforced');
    assertTrue(
      errors.some((message) => /at least one room showcase image/i.test(message)),
      'at least one showcase image is required',
    );

    const stillOpen = await page.countOf('.ant-modal-wrap:not([style*="display: none"])');
    assertTrue(stillOpen > 0, 'the modal stays open so the concierge can correct the entry');

    // A complete, valid suite is accepted.
    await page.type('[data-testid="editor-room-number"]', 'D-402');
    await page.type('[data-testid="editor-title"]', 'The Dune Cottage');
    await page.type('[data-testid="editor-tagline"]', 'A secluded stone cottage above the tide line.');
    await page.type('[data-testid="editor-description"]', 'Reclaimed coastal stone with a cedar shingle roof and an outdoor bathing court.');
    await page.type('[data-testid="editor-bedding"]', '1 Queen Bed');

    await page.fill('[data-testid="editor-base-rate"]', 640);
    await page.fill('[data-testid="editor-weekend-rate"]', 760);
    await page.fill('[data-testid="editor-resort-fee"]', 45);
    await page.fill('[data-testid="editor-cleaning-fee"]', 95);
    await page.fill('[data-testid="editor-square-meters"]', 120);
    await page.fill('[data-testid="editor-max-adults"]', 2);
    await page.fill('[data-testid="editor-max-children"]', 1);
    await page.fill('[data-testid="editor-max-infants"]', 1);

    await page.click('[data-testid="editor-image-add"]');
    await page.type('[data-testid="editor-image-url-0"]', 'https://images.unsplash.com/photo-1611892440504-42a792e24d32');
    await page.type('[data-testid="editor-image-alt-0"]', 'Dune cottage exterior');
    await page.type('[data-testid="editor-image-caption-0"]', 'Stone cottage entrance');
    await page.settle();

    await page.click('.ant-modal-footer .ant-btn-primary');
    await page.settle(900);

    const rooms = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      const list = (raw ? JSON.parse(raw) : {}).state.rooms;
      return list.map((room) => ({ roomNumber: room.roomNumber, slug: room.slug, images: room.images.length }));
    `);
    const created = rooms.find((room) => room.roomNumber === 'D-402');
    assertTrue(created !== undefined, 'the validated suite is added to the inventory');
    assertSame(created.slug, 'the-dune-cottage', 'a unique slug is derived from the residence name');
    assertSame(created.images, 1, 'the showcase image is persisted');
  });

  testAsync('a suite with live itineraries cannot be withdrawn', async () => {
    await freshPage();
    await resetInventory(page);
    await createReservationThroughUi(page, 'V-101');
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/admin/rooms`);
    await page.waitForSelector('[data-testid="room-inventory-table"]');

    await page.click('[data-testid="delete-room-V-101"]');
    await page.waitForSelector('.ant-popconfirm');
    await page.settle();
    await page.click('.ant-popconfirm .ant-btn-primary');
    await page.settle(700);

    const feedback = await page.evaluate(`
      const notice = document.querySelector('.ant-message-notice');
      return notice ? notice.innerText.trim() : null;
    `);
    assertTrue(feedback !== null, 'the concierge is told why the withdrawal failed');
    assertMatch(feedback, /active reservations/i, 'the guard explains the blocking condition');

    const stillListed = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      return (raw ? JSON.parse(raw) : {}).state.rooms.some((room) => room.roomNumber === 'V-101');
    `);
    assertTrue(stillListed, 'the suite remains in the catalogue');
  });

  /* ------------------------------------------------------------------ */
  suite('Phase 4 — reservation register');

  testAsync('the register lists the itinerary captured through the guest flow', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await createReservationThroughUi(page, 'P-501');

    await checkPage(
      async () => {
        await page.goto(`${server.origin}/admin/reservations`);
        await page.waitForSelector('[data-testid="reservation-register"]');
      },
      { label: 'the reservation register' },
    );
    await page.settle();

    const register = await page.evaluate(`
      const rows = [...document.querySelectorAll('[data-testid="reservation-register"] tbody tr.ant-table-row')];
      return rows.map((row) => ({
        reference: row.querySelector('td') ? row.querySelector('td').innerText.trim() : null,
        text: row.innerText.replace(/\\n+/g, ' | '),
      }));
    `);
    assertTrue(register.length >= 1, 'the register lists at least one itinerary');
    assertMatch(register[0].reference, /^RES-[0-9A-F]{10}$/, 'the reference column is rendered');
    assertMatch(register[0].text, /Amelia Hartwell/, 'the guest name is rendered');

    const grandTotal = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      return JSON.parse(raw).state.reservations[0].pricing.grandTotal;
    `);
    assertTrue(grandTotal > 0, 'the persisted folio carries a total');
    assertMatch(
      register[0].text,
      new RegExp(`${grandTotal.toLocaleString('en-US').replace(/,/g, ',')}`),
      'the register renders the same folio total that was persisted',
    );
  });

  testAsync('the details drawer shows the folio and drives check-in and check-out', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await createReservationThroughUi(page, 'V-101');
    await page.goto(`${server.origin}/admin/reservations`);
    await page.waitForSelector('[data-testid="reservation-register"] tbody tr.ant-table-row');
    await page.settle();

    const reference = await page.evaluate(`
      const cell = document.querySelector('[data-testid="reservation-register"] tbody tr.ant-table-row td');
      return cell ? cell.innerText.trim() : null;
    `);
    await page.click(`[data-testid="open-reservation-${reference}"]`);
    await page.waitForSelector('[data-testid="reservation-drawer"]');
    await page.settle();

    const drawer = await page.evaluate(`
      const node = document.querySelector('[data-testid="reservation-drawer"]');
      return {
        stay: node.querySelector('[data-testid="reservation-stay"]').innerText.trim(),
        folio: [...node.querySelectorAll('[data-testid="reservation-folio"] dt, [data-testid="reservation-folio"] dd')]
          .map((entry) => entry.innerText.trim()),
        total: node.querySelector('[data-testid="reservation-total"]').innerText.trim(),
        checkInDisabled: node.querySelector('[data-testid="reservation-check-in"]').disabled,
        checkOutDisabled: node.querySelector('[data-testid="reservation-check-out"]').disabled,
      };
    `);
    assertMatch(drawer.stay, /3 nights/, 'the stay window and night count are rendered');
    assertTrue(
      drawer.folio.some((line) => /service charge \(10%\)/i.test(line)),
      'the service charge is itemised separately',
    );
    assertTrue(
      drawer.folio.some((line) => /tourism tax \(8%\)/i.test(line)),
      'the occupancy tax is itemised separately',
    );
    const expectedTotal = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      return JSON.parse(raw).state.reservations[0].pricing.grandTotal;
    `);
    assertMatch(drawer.total, new RegExp(`\\$${expectedTotal.toLocaleString('en-US')}`), 'the balance due matches the persisted folio');
    assertFalse(drawer.checkInDisabled, 'a confirmed itinerary can be checked in');
    assertTrue(drawer.checkOutDisabled, 'an itinerary cannot be checked out before arrival');

    await page.click('[data-testid="reservation-check-in"]');
    await page.settle(700);
    await page.click('[data-testid="reservation-check-out"]');
    await page.settle(700);

    const finalStatus = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      const reservations = (raw ? JSON.parse(raw) : {}).state.reservations;
      return reservations[0].status;
    `);
    assertSame(finalStatus, 'CHECKED_OUT', 'the itinerary advances through check-in to check-out');
  });

  testAsync('the register filters by guest, status and stay window', async () => {
    await freshPage();
    await resetInventory(page);
    await createReservationThroughUi(page, 'V-101');
    await page.goto(`${server.origin}/admin/reservations`);
    await page.waitForSelector('[data-testid="reservation-register"]');
    await page.settle();

    await page.type('[data-testid="reservation-search"]', 'NoSuchGuest');
    await page.settle(500);
    const emptyText = await page.evaluate(`
      const node = document.querySelector('[data-testid="reservation-register"] .ant-empty-description');
      return node ? node.innerText.trim() : null;
    `);
    assertMatch(emptyText ?? '', /no itineraries match/i, 'an empty search explains itself');

    await page.type('[data-testid="reservation-search"]', 'Hartwell');
    await page.settle(500);
    const count = await page.evaluate(`
      return document.querySelector('[data-testid="reservation-count"]').innerText.trim();
    `);
    assertMatch(count, /^1 itinerary in view$/i, 'the register narrows to the matching guest');

    await page.click('[data-testid="reservation-status-filter"]');
    await page.waitForSelector('.ant-select-item-option');
    await page.settle();
    await page.evaluate(`
      const option = [...document.querySelectorAll('.ant-select-item-option')]
        .find((node) => node.innerText.trim().toLowerCase() === 'cancelled');
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    `);
    await page.settle(500);
    const filtered = await page.evaluate(`
      return document.querySelector('[data-testid="reservation-count"]').innerText.trim();
    `);
    assertMatch(filtered, /^0 itineraries in view$/i, 'the status filter composes with the guest search');
  });

  /* ------------------------------------------------------------------ */
  suite('Phase 5 — page assembly');

  testAsync('the landing page renders the hero, catalogue and concierge sections', async () => {
    await checkPage(
      async () => {
        await page.setViewport({ width: 1440, height: 900, mobile: false });
        await page.goto(`${server.origin}/`);
        await page.waitForSelector('[data-testid="result-count"]');
      },
      { label: 'the guest landing page' },
    );

    const showcase = await page.evaluate(`
      return {
        heading: document.querySelector('#showcase-heading') ? document.querySelector('#showcase-heading').innerText.trim() : null,
        heroStats: [...document.querySelectorAll('section dl dt')].map((node) => node.innerText.trim()),
        hasFilterBar: Boolean(document.querySelector('[data-testid="date-guest-filter-bar"]')),
        hasConcierge: Boolean(document.querySelector('[data-testid="addon-selector"]')),
        resultCount: document.querySelector('[data-testid="result-count"]').innerText.trim(),
        cards: document.querySelectorAll('[data-testid="room-card"]').length,
      };
    `);
    assertSame(showcase.heading, 'Curated Coastal Residences', 'the hero heading is rendered');
    assertTrue(
      showcase.heroStats.some((label) => /^residences$/i.test(label)),
      'the hero publishes a residence count',
    );
    assertTrue(
      showcase.heroStats.some((label) => /^concierge services$/i.test(label)),
      'the hero publishes the concierge count',
    );
    assertTrue(showcase.hasFilterBar, 'the search bar is part of the landing page');
    assertTrue(showcase.hasConcierge, 'the concierge section is part of the landing page');
    assertMatch(showcase.resultCount, /^4 of 4 residences available$/i, 'every suite starts available');
    assertSame(showcase.cards, 4, 'every suite is listed');
  });

  testAsync('an empty search offers a single-click reset', async () => {
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="result-count"]');

    // A party of twelve adults exceeds every suite in the catalogue.
    await page.click('[data-testid="guest-trigger"]');
    await page.waitForSelector('[data-testid="guest-panel"]');
    await page.settle();
    for (let press = 0; press < 10; press += 1) {
      await page.click('[data-testid="guest-adults-increment"]');
    }
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="empty-results"]', { timeout: 15_000 });

    const empty = await page.evaluate(`
      return document.querySelector('[data-testid="empty-results"]').innerText.replace(/\\n+/g, ' | ');
    `);
    assertMatch(empty, /No sanctuaries found for selected dates/i, 'the empty state explains itself');

    await page.click('[data-testid="empty-reset"]');
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="result-count"]');
    assertMatch(
      await page.evaluate('return document.querySelector(\'[data-testid="result-count"]\').innerText;'),
      /^4 of 4 residences available$/i,
      'the reset action restores the full catalogue',
    );
  });

  testAsync('the suite page renders its gallery, amenities and booking rail', async () => {
    await checkPage(
      async () => {
        await page.setViewport({ width: 1440, height: 900, mobile: false });
        await page.goto(`${server.origin}/rooms/the-cliffside-sanctuary`);
        await page.waitForSelector('[data-testid="booking-rail"]');
      },
      { label: 'the cliffside suite page' },
    );

    const suite = await page.evaluate(`
      return {
        title: document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : null,
        gallerySlides: [...new Set([...document.querySelectorAll('[data-testid="suite-gallery-image"]')]
          .map((node) => node.getAttribute('src')))].length,
        specs: [...document.querySelectorAll('[data-testid="room-spec-grid"] dd')].map((node) => node.innerText.trim()),
        amenities: [...document.querySelectorAll('[data-testid="amenity-row"]')].map((node) => node.innerText.split('\\n')[0].trim()),
        rail: document.querySelector('[data-testid="booking-rail"]').innerText,
        railPosition: window.getComputedStyle(document.querySelector('[data-testid="booking-rail"]')).position,
        desktopCta: document.querySelectorAll('[data-testid="suite-reserve"]').length,
        mobileCta: getComputedStyle(document.querySelector('.mobile-sticky-action')).display,
      };
    `);

    assertSame(suite.title, 'The Cliffside Sanctuary', 'the suite title is rendered');
    assertSame(suite.gallerySlides, 2, 'both showcase images are in the gallery');
    assertEqual(
      suite.specs,
      ['280 m²', '1 King Bed + 1 Daybed Lounge', 'Panoramic Cliff', '3 adults · 1 child · 1 infant'],
      'the detailed specification grid is rendered',
    );
    assertEqual(
      suite.amenities,
      ['Private Infinity Pool', 'Dedicated Butler', 'Wine Cellar Cabinet', 'Deep Soaking Marble Tub'],
      'the full amenity inventory is rendered',
    );
    assertMatch(suite.rail, /from/i, 'the booking rail quotes the nightly rate');
    assertMatch(suite.rail, /10% resort service charge/i, 'the rail discloses the service charge');
    assertSame(suite.railPosition, 'sticky', 'the rail is sticky on desktop');
    assertSame(suite.desktopCta, 1, 'the desktop call to action is rendered');
    assertSame(suite.mobileCta, 'none', 'the mobile bottom bar is hidden on desktop');
  });

  testAsync('the suite page swaps the rail for a fixed bottom bar on mobile', async () => {
    await checkPage(
      async () => {
        await page.setViewport({ width: 390, height: 844, mobile: true });
        await page.goto(`${server.origin}/rooms/the-celestial-penthouse`);
        await page.waitForSelector('[data-testid="suite-reserve-mobile"]');
      },
      { label: 'the penthouse suite page at 390px' },
    );

    const mobile = await page.evaluate(`
      const bar = document.querySelector('.mobile-sticky-action');
      const cta = document.querySelector('[data-testid="suite-reserve-mobile"]');
      const style = window.getComputedStyle(bar);
      return {
        position: style.position,
        bottomGap: window.innerHeight - cta.getBoundingClientRect().bottom,
        height: Math.round(cta.getBoundingClientRect().height),
        desktopRail: Boolean(document.querySelector('[data-testid="booking-rail"]')),
        paddingBottom: style.paddingBottom,
      };
    `);
    assertSame(mobile.position, 'fixed', 'the mobile action bar is pinned to the viewport');
    assertTrue(mobile.bottomGap < 24, `the call to action sits within thumb reach (${Math.round(mobile.bottomGap)}px from the bottom)`);
    assertTrue(mobile.height >= 44, 'the mobile call to action keeps a 44px touch height');
    assertTrue(mobile.desktopRail, 'the booking rail is still rendered for wide viewports');
  });

  testAsync('the suite page opens the booking drawer from either call to action', async () => {
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${server.origin}/rooms/the-banyan-garden-pavilion`);
    await page.waitForSelector('[data-testid="suite-reserve-mobile"]');

    await page.click('[data-testid="suite-reserve-mobile"]');
    await page.waitForSelector('[data-testid="booking-drawer"]');
    await page.settle();

    const drawer = await page.evaluate(`
      return document.querySelector('[data-testid="booking-drawer"]').innerText;
    `);
    assertMatch(drawer, /The Banyan Garden Pavilion/, 'the drawer is scoped to the suite being viewed');
    assertMatch(drawer, /Confirm reservation/i, 'the drawer offers the confirm action');
  });

  testAsync('an unknown suite slug renders the resort 404 with a way back', async () => {
    await freshPage();
    await checkPage(
      async () => {
        await page.setViewport({ width: 1440, height: 900, mobile: false });
        await page.goto(`${server.origin}/rooms/the-lighthouse-loft`);
        await page.waitForSelector('[data-testid="not-found-home"]');
      },
      // The document itself reports a 404, which is the behaviour under test.
      { label: 'the unknown suite page', allowStatuses: ['404'] },
    );

    const body = await page.evaluate('return document.body.innerText;');
    assertMatch(body, /Residence not found/i, 'the unknown slug reports a not-found heading');
    assertMatch(body, /not part of the collection/i, 'the 404 is written in the resort voice');
    assertMatch(body, /Return to the catalogue/i, 'the 404 offers a way back to the catalogue');
  });

  testAsync('a suite withdrawn from the catalogue explains itself', async () => {
    await freshPage();
    await page.goto(`${server.origin}/`);
    await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed) {
        parsed.state.rooms = parsed.state.rooms.filter((room) => room.roomNumber !== 'V-101');
        window.localStorage.setItem('resort-inventory-storage', JSON.stringify(parsed));
      }
      return true;
    `);

    await checkPage(
      async () => {
        await page.goto(`${server.origin}/rooms/the-cliffside-sanctuary`);
        await page.waitForSelector('.ant-empty-description');
      },
      { label: 'a withdrawn suite page' },
    );

    const body = await page.evaluate('return document.body.innerText;');
    assertMatch(body, /no longer listed/i, 'a withdrawn suite renders a helpful empty state');
    assertMatch(body, /Return to the catalogue/i, 'the empty state offers a way back');
  });

  testAsync('the itinerary pass renders the folio with distinct tax lines', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    const reference = await createReservationThroughUi(page, 'V-101');

    await checkPage(
      async () => {
        await page.goto(`${server.origin}/booking/confirmation/${reference}`);
        await page.waitForSelector('[data-testid="itinerary-pass"]');
      },
      { label: 'the itinerary pass' },
    );

    const itinerary = await page.evaluate(`
      const pass = document.querySelector('[data-testid="itinerary-pass"]');
      return {
        reference: pass.querySelector('h1').parentElement.innerText,
        folio: [...pass.querySelectorAll('[data-testid="itinerary-folio"] dt, [data-testid="itinerary-folio"] dd')]
          .map((node) => node.innerText.trim()),
        total: pass.querySelector('[data-testid="itinerary-total"]').innerText.trim(),
        stay: pass.querySelector('[data-testid="itinerary-stay"]').innerText.trim(),
        printButton: Boolean(pass.querySelector('[data-testid="print-itinerary"]')),
      };
    `);

    assertMatch(itinerary.reference, new RegExp(reference), 'the voucher shows the booking reference');
    assertTrue(
      itinerary.folio.some((line) => /service charge \(10%\)/i.test(line)),
      'the service charge is itemised separately',
    );
    assertTrue(
      itinerary.folio.some((line) => /tourism tax \(8%\)/i.test(line)),
      'the occupancy tax is itemised separately',
    );
    assertTrue(
      itinerary.folio.some((line) => /Nightly rate/.test(line)),
      'the nightly rate is itemised',
    );
    assertMatch(itinerary.stay, /3 nights/, 'the stay window and night count are shown');
    assertMatch(itinerary.total, /^\$5,340$/, 'the total paid matches the quoted folio');
    assertTrue(itinerary.printButton, 'the voucher offers a print action');
  });

  testAsync('the itinerary print stylesheet drops the navigation and actions', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    const printable = await createReservationThroughUi(page, 'V-101');
    await page.goto(`${server.origin}/booking/confirmation/${printable}`);
    await page.waitForSelector('[data-testid="itinerary-pass"]');

    const printRules = await page.evaluate(`
      const sheets = [...document.styleSheets];
      const rules = [];
      for (const sheet of sheets) {
        let list;
        try { list = sheet.cssRules; } catch { continue; }
        for (const rule of list) {
          if (rule.media && String(rule.media.mediaText).includes('print')) {
            rules.push(rule.cssText);
          }
        }
      }
      return rules.join('\\n');
    `);
    assertMatch(printRules, /\.no-print/, 'a print rule hides the interactive chrome');
    assertMatch(printRules, /\.itinerary-pass/, 'a print rule styles the voucher itself');

    const hidden = await page.evaluate(`
      const actions = document.querySelector('[data-testid="print-itinerary"]');
      return actions.closest('.no-print') !== null;
    `);
    assertTrue(hidden, 'the print action lives inside the hidden chrome region');
  });

  testAsync('an itinerary reference unknown to this device explains itself', async () => {
    await checkPage(
      async () => {
        await page.setViewport({ width: 1440, height: 900, mobile: false });
        await page.goto(`${server.origin}/booking/confirmation/RES-0000000000`);
        await page.waitForSelector('.ant-empty-description');
      },
      { label: 'the unknown itinerary page' },
    );

    const body = await page.evaluate('return document.body.innerText;');
    assertMatch(body, /Itinerary not found on this device/i, 'the missing itinerary renders a helpful empty state');
    assertMatch(body, /concierge desk/i, 'the empty state points the guest to the concierge');
  });

  testAsync('a completed booking redirects the guest to their itinerary', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });

    await openBookingDrawer(page, 'S-204');
    await selectStayDates(page, STAY.arrival, STAY.departure);
    await page.settle();
    await completeGuestForm(page);
    await page.click('[data-testid="booking-submit"]');

    await page.waitForSelector('[data-testid="itinerary-pass"]', { timeout: 20_000 });
    await page.settle();

    const url = await page.evaluate('return location.pathname;');
    assertMatch(url, /^\/booking\/confirmation\/RES-[0-9A-F]{10}$/, 'checkout lands on the itinerary pass');

    const reference = url.split('/').pop();
    const stored = await page.evaluate(`
      const raw = window.localStorage.getItem('resort-inventory-storage');
      return JSON.parse(raw).state.reservations[0].bookingReference;
    `);
    assertSame(reference, stored, 'the itinerary URL matches the persisted booking reference');
  });

  testAsync('the staff console is gated until a passkey is accepted', async () => {
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });

    // A visitor arriving straight at a console URL, with no prior authorisation.
    await checkPage(
      async () => {
        await page.goto(`${server.origin}/admin/rooms`);
        await page.waitForSelector('[data-testid="admin-passkey"]');
      },
      { label: 'the locked console' },
    );

    const locked = await page.evaluate(`
      return {
        heading: document.querySelector('h3') ? document.querySelector('h3').innerText.trim() : null,
        consoleVisible: Boolean(document.querySelector('[data-testid="room-inventory-table"]')),
        session: window.sessionStorage.getItem('aura_cove_staff_session'),
      };
    `);
    assertMatch(locked.heading ?? '', /Staff Access Control/i, 'the gate prompts for authorisation');
    assertFalse(locked.consoleVisible, 'the inventory console is not rendered for an unauthorised visitor');
    assertSame(locked.session, null, 'no session is created by merely visiting the URL');

    await page.type('[data-testid="admin-passkey"]', 'wrong-passkey');
    await page.click('[data-testid="admin-authorize"]');
    await page.waitForSelector('[data-testid="admin-auth-error"]');
    assertTrue(
      await page.evaluate(`return window.sessionStorage.getItem('aura_cove_staff_session') === null;`),
      'a rejected passkey does not open a session',
    );

    await page.type('[data-testid="admin-passkey"]', 'auracove2026');
    await page.click('[data-testid="admin-authorize"]');
    await page.waitForSelector('[data-testid="room-inventory-table"]', { timeout: 15_000 });
    await page.settle();

    assertTrue(
      await page.evaluate(`return window.sessionStorage.getItem('aura_cove_staff_session') === 'active';`),
      'the accepted passkey opens a staff session',
    );

    // Ending the session re-locks the console.
    await page.click('[data-testid="admin-sign-out"]');
    await page.waitForSelector('[data-testid="admin-passkey"]');
    assertFalse(
      await page.evaluate(`return Boolean(document.querySelector('[data-testid="room-inventory-table"]'));`),
      'ending the session hides the console again',
    );
  });

  testAsync('the reservation register is gated as well', async () => {
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await page.goto(`${server.origin}/admin/reservations`);
    await page.waitForSelector('[data-testid="admin-passkey"]');
    assertFalse(
      await page.evaluate(`return Boolean(document.querySelector('[data-testid="reservation-register"]'));`),
      'guest PII in the register is not rendered for an unauthorised visitor',
    );
  });

  testAsync('the console shell publishes its metrics top bar', async () => {
    await freshPage();
    await resetInventory(page);
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    await createReservationThroughUi(page, 'V-101');

    await checkPage(
      async () => {
        await page.goto(`${server.origin}/admin/rooms`);
        await page.waitForSelector('[data-testid="console-metrics"]');
      },
      { label: 'the inventory console' },
    );

    const inventoryMetrics = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="console-metrics"] dt')].map((node) => node.innerText.trim());
    `);
    assertEqual(
      inventoryMetrics.map((label) => label.toLowerCase()),
      ['in inventory', 'occupied tonight', 'withdrawn', 'booked value'],
      'the inventory console publishes its occupancy figures',
    );

    await checkPage(
      async () => {
        await page.goto(`${server.origin}/admin/reservations`);
        await page.waitForSelector('[data-testid="console-metrics"]');
      },
      { label: 'the reservation register' },
    );
    const registerMetrics = await page.evaluate(`
      return [...document.querySelectorAll('[data-testid="console-metrics"] dt')].map((node) => node.innerText.trim());
    `);
    assertEqual(
      registerMetrics.map((label) => label.toLowerCase()),
      ['live itineraries', 'in house tonight', 'booked value'],
      'the register publishes its itinerary figures',
    );

    const occupancy = await page.evaluate(`
      const cards = [...document.querySelectorAll('[data-testid="console-metrics"] dd')];
      return cards.map((node) => node.innerText.trim());
    `);
    assertSame(occupancy[0], '1', 'the suite with a live itinerary is reported as occupied tonight');
  });

  /* ------------------------------------------------------------------ */
  suite('Phase 5 — responsive viewport sweep');

  const ROUTES = [
    { path: '/', name: 'catalogue' },
    { path: '/rooms/the-cliffside-sanctuary', name: 'suite-detail' },
    { path: '/admin/rooms', name: 'inventory-console' },
    { path: '/admin/reservations', name: 'reservation-register' },
  ];

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      testAsync(`${route.name} is free of clipping at ${viewport.label}`, async () => {
        await checkPage(
          async () => {
            await page.setViewport(viewport);
            await page.goto(`${server.origin}${route.path}`);
            if (route.path.startsWith('/admin/')) {
              await authoriseStaff(page);
              await page.goto(`${server.origin}${route.path}`);
            }
            await page.waitForSelector('main, body > div');
          },
          { label: `${route.path} at ${viewport.label}` },
        );
        await page.settle(400);

        const layout = await page.layoutReport();
        assertFalse(
          layout.horizontalOverflow,
          `${route.path} must not scroll sideways at ${viewport.label} (scrollWidth ${layout.scrollWidth} vs ${layout.viewportWidth}); offenders: ${JSON.stringify(layout.overflowing)}`,
        );

        // 44x44 is a finger-sized target rule and only applies where the device has a
        // finger; pointer viewports are held to the 24x24 WCAG 2.2 minimum instead.
        const minimum = viewport.mobile ? 44 : 24;
        const undersized = await page.touchTargetReport(minimum);
        assertEqual(
          undersized,
          [],
          `every control on ${route.path} at ${viewport.label} must be at least ${minimum}x${minimum} CSS pixels`,
        );

        await page.screenshot(
          path.join(SCREENSHOT_DIR, `phase5-${route.name}-${viewport.width}.png`),
        );
      });
    }
  }

  /* ------------------------------------------------------------------ */
  suite('Responsive shell — Phase 1 baseline');

  for (const viewport of VIEWPORTS) {
    testAsync(`no horizontal overflow or clipping at ${viewport.label}`, async () => {
      await freshPage();
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
    await freshPage();
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
    await freshPage();
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