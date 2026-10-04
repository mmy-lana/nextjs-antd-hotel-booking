/**
 * Development-mode deprecation gate.
 *
 * Ant Design emits its `Warning: [antd: ...] 'x' is deprecated` messages only when
 * `process.env.NODE_ENV !== 'production'`, so the production UI suite cannot observe
 * them. This check boots `next dev`, opens every component that renders an Ant Design
 * overlay, and fails if any deprecation warning reaches the console.
 *
 * Run with:  pnpm run verify:dev
 */
import { assertEqual, assertMatch, assertTrue, report, runAsyncTests, suite, testAsync } from './harness.mjs';
import dayjs from 'dayjs';
import { launchHeadlessChrome, openPage } from './headless-chrome.mjs';
import { startNextServer } from './next-server.mjs';
import { defaultRooms } from '@/lib/data/seedRooms';
import { defaultAddons } from '@/lib/data/seedAddons';
import { calculateReservationQuote } from '@/lib/utils/pricingEngine';

process.stdout.write('Booting the development server...\n');
const server = await startNextServer({ dev: true, readyTimeoutMs: 180_000 });
const browser = await launchHeadlessChrome({ width: 390, height: 844 });
let page = await openPage(browser.browserWsUrl);

/**
 * Replaces the active tab with a brand new one.
 *
 * The development server compiles each route lazily, so isolating every scenario in its
 * own tab keeps one slow compile from bleeding into the next assertion.
 */
async function freshPage() {
  await page?.close().catch(() => {});
  page = await openPage(browser.browserWsUrl);
  return page;
}

/** Collects every Ant Design deprecation warning seen so far. */
async function deprecationWarnings() {
  return page.consoleEntries
    .filter((entry) => /deprecated/i.test(entry.text))
    .map((entry) => entry.text);
}

/**
 * Drives the Ant Design date pickers inside the booking drawer.
 *
 * Dates are chosen by clicking real calendar cells rather than typing, which exercises
 * the same code path a guest uses.
 */
async function selectStayDates(page, arrivalIso, departureIso) {
  const arrival = dayjs(arrivalIso);
  const departure = dayjs(departureIso);
  // The picker header renders `Oct2026` with no space, so the comparison must match that.
  const targetMonth = arrival.format('MMM') + arrival.format('YYYY');

  const displayedMonth = () =>
    page.evaluate(`
      const dropdown = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
      const title = dropdown && dropdown.querySelector('.ant-picker-header-view');
      return title ? title.textContent.trim() : null;
    `);

  const revealTargetMonth = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await displayedMonth()) === targetMonth) {
        return;
      }
      const advanced = await page.evaluate(`
        const dropdown = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
        const next = dropdown && dropdown.querySelector('.ant-picker-header-next-btn');
        if (!next) { return false; }
        next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      `);
      if (!advanced) {
        return;
      }
      await page.settle(300);
    }
  };

  const choose = async (iso) => {
    const cell = `.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td[title="${iso}"]`;
    await page.waitForSelector(cell, { timeout: 10_000 });
    await page.click(cell);
    await page.settle(400);
  };

  // The picker input only receives a click once it is visible inside the scrolled
  // drawer body; a mounted-but-off-screen input silently swallows the click.
  await page.waitForSelector('[data-testid="booking-check-in"]', { visible: true });
  await page.scrollIntoView('[data-testid="booking-check-in"]');
  await page.click('[data-testid="booking-check-in"]');
  await page.waitForSelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
  await page.settle(400);
  await revealTargetMonth();
  await choose(arrivalIso);

  await page.waitForSelector('[data-testid="booking-check-out"]', { visible: true });
  await page.scrollIntoView('[data-testid="booking-check-out"]');
  await page.click('[data-testid="booking-check-out"]');
  await page.waitForSelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
  await page.settle(400);
  await revealTargetMonth();
  await choose(departureIso);
}

/**
 * Seeds a confirmed itinerary so the staff register has a row to open.
 */
const CLIFFSIDE = defaultRooms[0];

/**
 * A future stay window close enough to the current month that the booking drawer can
 * reach it with a single "next month" step.
 */
const RESERVATION_CHECK_IN = dayjs().add(1, 'month').startOf('month').add(9, 'day');
const RESERVATION_CHECK_OUT = RESERVATION_CHECK_IN.add(4, 'day');

const RESERVATION = {
  id: '11111111-2222-4333-8444-555555555555',
  bookingReference: 'RES-DEVCHECK1',
  roomId: CLIFFSIDE.id,
  guest: {
    guestId: 'guest-devcheck',
    title: 'Dr',
    firstName: 'Verity',
    lastName: 'Okonkwo',
    email: 'verity.okonkwo@example.com',
    phone: '+1 555 0199',
  },
  checkInDate: RESERVATION_CHECK_IN.format('YYYY-MM-DD'),
  checkOutDate: RESERVATION_CHECK_OUT.format('YYYY-MM-DD'),
  guestCounts: { adults: 2, children: 0, infants: 0 },
  selectedAddons: [],
  pricing: calculateReservationQuote(
    CLIFFSIDE,
    RESERVATION_CHECK_IN.format('YYYY-MM-DD'),
    RESERVATION_CHECK_OUT.format('YYYY-MM-DD'),
    []
  ),
  status: 'CONFIRMED',
  paymentStatus: 'PAID',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

try {
  suite('Development deprecation gate');

  testAsync('the mobile navigation drawer raises no deprecation warning', async () => {
    await freshPage();
    // The drawers are exercised at the mobile resolution from the plan's matrix.
    await page.setViewport({ width: 390, height: 844, mobile: true });
    page.resetDiagnostics();
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-testid="navbar-toggle"]', { timeout: 60_000 });
    // The masthead only swaps to the hamburger once the breakpoint resolves.
    await page.waitForSelector('[data-testid="navbar-toggle"]', { visible: true, timeout: 30_000 });
    await page.settle(600);
    await page.click('[data-testid="navbar-toggle"]');
    await page.waitForSelector('[data-testid="navbar-drawer"]', { timeout: 30_000 });
    await page.settle();

    assertEqual(await deprecationWarnings(), [], 'the navigation drawer must be free of deprecation warnings');
  });

  testAsync('the booking drawer raises no deprecation warning', async () => {
    await freshPage();
    await page.setViewport({ width: 390, height: 844, mobile: true });
    page.resetDiagnostics();
    await page.goto(`${server.origin}/`);
    await page.waitForSelector('[data-room-number="V-101"]', { timeout: 60_000 });
    await page.click('[data-room-number="V-101"] [data-testid="room-card-reserve"]');
    await page.waitForSelector('[data-testid="booking-drawer"]', { timeout: 30_000 });
    await page.settle();

    assertEqual(await deprecationWarnings(), [], 'the booking drawer must be free of deprecation warnings');
  });

  testAsync('the reservation drawer raises no deprecation warning', async () => {
    await freshPage();
    await page.setViewport({ width: 390, height: 844, mobile: true });
    page.resetDiagnostics();
    await page.goto(`${server.origin}/`);
    await page.evaluate(`
      window.localStorage.clear();
      window.sessionStorage.setItem('aura_cove_staff_session', 'active');
      window.localStorage.setItem('resort-inventory-storage', JSON.stringify({
        state: { rooms: ${JSON.stringify(defaultRooms)}, reservations: ${JSON.stringify([RESERVATION])}, addons: ${JSON.stringify(defaultAddons)} },
        version: 0,
      }));
      return true;
    `);

    await page.goto(`${server.origin}/admin/reservations`);
    await page.waitForSelector(`[data-testid="open-reservation-${RESERVATION.bookingReference}"]`, {
      timeout: 60_000,
    });
    await page.click(`[data-testid="open-reservation-${RESERVATION.bookingReference}"]`);
    await page.waitForSelector('[data-testid="reservation-drawer"]', { timeout: 30_000 });
    await page.settle();

    assertEqual(await deprecationWarnings(), [], 'the reservation drawer must be free of deprecation warnings');
  });

  testAsync('the staff console Alerts raise no deprecation warning', async () => {
    await freshPage();
    await page.setViewport({ width: 390, height: 844, mobile: true });
    page.resetDiagnostics();

    // A rejected passkey renders the `<Alert title=...>` inline error.
    await page.goto(`${server.origin}/admin/rooms`);
    await page.waitForSelector('[data-testid="admin-passkey"]', { timeout: 60_000 });
    await page.type('[data-testid="admin-passkey"]', 'wrong-passkey');
    await page.click('[data-testid="admin-authorize"]');
    await page.waitForSelector('[data-testid="admin-auth-error"]', { timeout: 30_000 });
    await page.settle();

    assertTrue(
      (await page.textOf('[data-testid="admin-auth-error"]'))[0]?.includes('Invalid authorisation'),
      'the inline Alert actually rendered',
    );
    assertEqual(await deprecationWarnings(), [], 'Alert must not use the deprecated message prop');
  });

  testAsync('the booking drawer Alerts raise no deprecation warning', async () => {
    await freshPage();
    await page.setViewport({ width: 390, height: 844, mobile: true });
    page.resetDiagnostics();

    // A conflicting window renders the `<Alert title=...>` conflict notice.
    await page.goto(`${server.origin}/`);
    await page.evaluate(`
      window.localStorage.clear();
      window.sessionStorage.setItem('aura_cove_staff_session', 'active');
      const rooms = ${JSON.stringify(defaultRooms)};
      const addons = ${JSON.stringify(defaultAddons)};
      window.localStorage.setItem('resort-inventory-storage', JSON.stringify({
        state: { rooms, reservations: [${JSON.stringify(RESERVATION)}], addons },
        version: 0,
      }));
      return true;
    `);

    await page.goto(`${server.origin}/rooms/the-cliffside-sanctuary`);
    await page.waitForSelector('[data-testid="suite-reserve"]', { timeout: 60_000 });
    await page.click('[data-testid="suite-reserve"]');
    await page.waitForSelector('[data-testid="booking-drawer"]', { timeout: 30_000 });

    // Select the dates the seeded itinerary already occupies.
    const [start, end] = await page.evaluate(`
      const reservation = ${JSON.stringify(RESERVATION)};
      return [reservation.checkInDate, reservation.checkOutDate];
    `);
    await selectStayDates(page, start, end);
    await page.settle();

    await page.waitForSelector('[data-testid="booking-conflict"]', { timeout: 30_000 });
    assertEqual(await deprecationWarnings(), [], 'Alert must not use the deprecated message prop');
  });

  testAsync('the segment error boundary catches a render failure', async () => {
    await freshPage();
    await page.setViewport({ width: 1440, height: 900, mobile: false });
    page.resetDiagnostics();

    await page.goto(`${server.origin}/`);
    await page.evaluate(`window.sessionStorage.setItem('aura_cove_force_segment_error', '1'); return true;`);
    await page.goto(`${server.origin}/`);

    await page.waitForSelector('[data-testid="error-reset"]', { timeout: 60_000 });
    await page.settle();

    const boundary = await page.evaluate(`
      const main = document.querySelector('main');
      return {
        text: main ? main.innerText.replace(/\\n+/g, ' | ') : '',
        reset: Boolean(document.querySelector('[data-testid="error-reset"]')),
        home: Boolean(document.querySelector('main a[href="/"]')),
      };
    `);
    assertMatch(boundary.text, /Unable to load this page/i, 'the segment boundary explains the interruption');
    assertTrue(boundary.reset, 'the boundary offers a retry action');
    assertTrue(boundary.home, 'the boundary offers a route back to the catalogue');

    // Retry must clear the fault and restore the page, proving `reset` is wired.
    await page.evaluate(`window.sessionStorage.removeItem('aura_cove_force_segment_error'); return true;`);
    await page.click('[data-testid="error-reset"]');
    await page.waitForSelector('[data-testid="result-count"]', { timeout: 60_000 });
    assertTrue(true, 'reset recovered the segment');
  });

  testAsync('the whole development console run produced no deprecation warnings', async () => {
    const all = page.consoleEntries.filter((entry) => /deprecated/i.test(entry.text));
    assertTrue(Array.isArray(all), 'the diagnostics buffer is readable');
    assertEqual(all, [], 'no Ant Design deprecation warning should appear anywhere in the console run');
  });

  await runAsyncTests();
} finally {
  await page?.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.stop();
}

report('Development deprecation gate');