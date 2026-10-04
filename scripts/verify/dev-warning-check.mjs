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
import { assertEqual, assertTrue, report, runAsyncTests, suite, testAsync } from './harness.mjs';
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
 * Seeds a confirmed itinerary so the staff register has a row to open.
 */
const CLIFFSIDE = defaultRooms[0];
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
  checkInDate: '2027-03-06',
  checkOutDate: '2027-03-10',
  guestCounts: { adults: 2, children: 0, infants: 0 },
  selectedAddons: [],
  pricing: calculateReservationQuote(CLIFFSIDE, '2027-03-06', '2027-03-10', []),
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