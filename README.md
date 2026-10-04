# Aura Cove Sanctuary | Hotel Booking Platform with Room Management

A modern, luxury boutique resort reservation platform and staff inventory control system built with Next.js App Router, Ant Design, TypeScript, and Zustand.

- **Live Deployment:** [nextjs-antd-hotel-booking.vercel.app](https://nextjs-antd-hotel-booking.vercel.app)
- **Repository:** [github.com/mmy-lana/nextjs-antd-hotel-booking](https://github.com/mmy-lana/nextjs-antd-hotel-booking)

---

## 1. Overview & Aesthetic Profile

Aura Cove Sanctuary is designed to reflect the digital presence of an ultra-luxury boutique coastal resort. The interface prioritizes editorial elegance, architectural geometry, and high-precision hospitality operations:

- **Aesthetic Direction:** Warm sand (`#FAF8F5`), ivory silk, deep espresso charcoal (`#1F1B18`), and refined bronze accents (`#8C704B`).
- **Typography:** Display serif headings paired with clean geometric sans-serif for numbers, folios, and specifications.
- **Touch-First Accessibility:** 100% functional without hover dependencies; all primary interactive elements maintain a minimum 44x44px touch target on mobile viewports.
- **Zero Layout Shifts:** Seamless server-side stylesheet extraction using `@ant-design/nextjs-registry`.

---

## 2. Core Feature Matrix

### Guest Experience
- **Curated Residence Showcase:** Interactive catalog presenting villas and suites with locked 4:3 architectural photography, view orientations, dimension metrics, and amenity inventories.
- **Adaptive Date & Guest Filter Bar:** 
  - Dual stacked date inputs on viewports under 576px to prevent clipping.
  - Unified range picker on tablet and desktop screens.
  - Popover-managed party counter for adults, children, and infants.
- **Live Concierge Enhancements:** Selectable luxury add-ons (helicopter transfers, caviar rituals, spa passes, yacht charters) quoted live against stay duration.
- **Slide-Out Booking Drawer:** Vertical form layout with real-time Zod field validation, dynamic subtotal recalculation, and overlap conflict notices.
- **Print-Ready Itinerary Pass (`/booking/confirmation/[ref]`):** Digital guest voucher featuring itemized tax breakdowns (10% luxury resort service charge and 8% local occupancy tax) and media print stylesheets that strip navigation chrome.

### Staff Console & Front Office (`/admin/rooms`, `/admin/reservations`)
- **Access Control Barrier:** Gated with an administrative passkey challenge (`auracove2026`) and session storage isolation.
- **Suite Inventory Matrix:** Horizontal-scrolling data table with inline base and weekend rate adjustments, live occupancy summaries, and operational status toggles (`AVAILABLE`, `OCCUPIED`, `RESERVED`, `MAINTENANCE`, `CLEANING`).
- **Suite Management Modal:** Full CRUD modal validating room dimensions, occupancy rules, amenities, and showcase images via Zod schemas.
- **Reservation Register:** Filterable ledger sorting stays by date overlap, guest name, and reservation status.
- **Folio Drawer Operations:** Front-office actions for customer check-in, check-out, and stay cancellations with archived room metadata resolution.

---

## 3. Architecture & Enterprise Engineering

### Concurrency & Cross-Tab Synchronization
- **Web Locks API:** Double-booking prevention uses `navigator.locks.request` to execute atomic read-check-commit transactions across parallel browser sessions.
- **BroadcastChannel State Sync:** Mutations committed in one browser tab post to an `aura-cove-inventory-sync` channel with monotonic revision tracking, automatically synchronizing sibling tabs without manual page reloads.

### Financial Precision Engine
- **Non-Drifting Decimal Math:** Replaced floating-point multiplication with integer-ratio calculations to prevent one-cent reconciliation drift.
- **Date Inversion Guards:** Stays must have a check-out date strictly after check-in; invalid or negative date ranges throw a typed `InvalidStayRangeError`.

### Next.js App Router Error Boundaries
- **Segment Boundary (`app/error.tsx`):** Catches route-level exceptions, reports server correlation digests, and offers state recovery triggers.
- **Root Document Boundary (`app/global-error.tsx`):** Self-contained, dependency-free HTML document barrier providing application reload capability in the event of root shell failure.

---

## 4. Tech Stack

- **Framework:** Next.js (App Router, latest)
- **UI Library:** Ant Design (`antd`, `@ant-design/icons`, `@ant-design/nextjs-registry`)
- **State Management:** Zustand (with local storage persistence and cross-tab sync)
- **Validation:** Zod
- **Date Utility:** Day.js
- **Package Manager:** pnpm

---

## 5. Project Directory Structure

```
nextjs-antd-hotel-booking/
├── app/
│   ├── admin/
│   │   ├── reservations/
│   │   │   └── page.tsx              # Front-office reservation ledger
│   │   ├── rooms/
│   │   │   └── page.tsx              # Suite inventory & rate control matrix
│   │   └── layout.tsx                # Admin shell with authentication gate
│   ├── booking/
│   │   └── confirmation/[ref]/
│   │       └── page.tsx              # Printable guest itinerary voucher
│   ├── rooms/
│   │   └── [slug]/
│   │       ├── not-found.tsx         # Branded 404 for retired suites
│   │       └── page.tsx              # Suite deep-dive & sticky booking rail
│   ├── error.tsx                     # Segment error boundary
│   ├── global-error.tsx              # Root HTML error boundary
│   ├── globals.css                   # Resort typography tokens & print styles
│   ├── layout.tsx                    # Root SSR layout
│   └── page.tsx                      # Guest landing page & residence showcase
├── components/
│   ├── AntdProviders.tsx             # Client boundary for AntdRegistry & theme
│   ├── molecules/                    # AddonSelector, DateGuestFilterBar, RoomCard, RoomSpecGrid
│   ├── organisms/                    # AdminAuthGuard, BookingDrawer, HeaderNavbar,
│   │                                 # ReservationDetailsDrawer, RoomEditorModal, RoomInventoryTable
│   ├── primitives/                   # AmenityIcon, LuxuryPriceTag, SectionHeader, StatusBadge
│   └── templates/                    # AdminConsoleShell, ItineraryPass, ResortShowcase, SuiteShowcase
├── lib/
│   ├── data/                         # Initial seed suites and concierge add-ons
│   ├── store/                        # Zustand stores (inventoryStore, bookingStore)
│   ├── theme/                        # Ant Design design token configuration
│   └── utils/                        # Availability checks, pricingEngine, storage layer
├── schemas/
│   └── validation.ts                 # Zod schemas for rooms, guests, and submissions
├── scripts/
│   └── verify/                       # Headless Chrome and domain test harnesses
└── types/
    └── booking.ts                    # Pure TypeScript domain interfaces
```

---

## 6. Getting Started

### Prerequisites
- Node.js 20 or higher
- pnpm (strictly enforced)

### Installation
```bash
# Clone the repository
git clone https://github.com/mmy-lana/nextjs-antd-hotel-booking.git
cd nextjs-antd-hotel-booking

# Install dependencies
pnpm install
```

### Development
```bash
pnpm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build
```bash
pnpm run build
pnpm run start
```

---

## 7. Verification & Automated Testing

The project includes custom verification suites that run directly against production and development instances via headless Chrome:

```bash
# Run all verification checks
pnpm run verify

# Individual test runners:
pnpm run typecheck       # Static TypeScript validation
pnpm run verify:domain   # Domain logic, Zod validation, and store unit assertions
pnpm run verify:ui       # End-to-end user flows and responsive viewport sweeps (360px - 1440px)
pnpm run verify:dev      # Development-mode deprecation gate (validates zero console warnings)
```

---

## 8. Demonstration Credentials

- **Admin Passkey:** `auracove2026`
- **Admin Access URL:** `/admin/rooms` or select "Staff Console" in the top navigation.

---

## 9. License

MIT
