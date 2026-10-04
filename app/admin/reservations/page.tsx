'use client';

import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { App, Button, DatePicker, Empty, Input, Select, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { AdminConsoleShell } from '@/components/templates/AdminConsoleShell';
import { ReservationDetailsDrawer } from '@/components/organisms/ReservationDetailsDrawer';
import { ReservationStatusBadge, PaymentStatusBadge } from '@/components/primitives/StatusBadge';
import { isDateRangeOverlapping } from '@/lib/utils/availability';
import type { Reservation } from '@/types/booking';

const { RangePicker } = DatePicker;

export default function AdminReservationsPage() {
  const { message } = App.useApp();
  const reservations = useInventoryStore((state) => state.reservations);
  const rooms = useInventoryStore((state) => state.rooms);
  const addons = useInventoryStore((state) => state.addons);
  const updateReservationStatus = useInventoryStore((state) => state.updateReservationStatus);
  const cancelReservation = useInventoryStore((state) => state.cancelReservation);

  const [window_, setWindow] = useState<[Dayjs, Dayjs] | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Reservation['status'] | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reservations.filter((reservation) => {
      if (statusFilter !== 'ALL' && reservation.status !== statusFilter) {
        return false;
      }
      if (window_ && !isDateRangeOverlapping(
        window_[0].format('YYYY-MM-DD'),
        window_[1].format('YYYY-MM-DD'),
        reservation.checkInDate,
        reservation.checkOutDate,
      )) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const room = roomById.get(reservation.roomId);
      return [
        reservation.bookingReference,
        reservation.guest.firstName,
        reservation.guest.lastName,
        reservation.guest.email,
        room?.title ?? '',
        room?.roomNumber ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [query, reservations, roomById, statusFilter, window_]);

  const selected = useMemo(
    () => reservations.find((reservation) => reservation.id === selectedId) ?? null,
    [reservations, selectedId],
  );

  const columns: TableColumnsType<Reservation> = [
    {
      title: 'Reference',
      dataIndex: 'bookingReference',
      key: 'bookingReference',
      width: 170,
      sorter: (a, b) => a.bookingReference.localeCompare(b.bookingReference),
      render: (value: string) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</span>
      ),
    },
    {
      title: 'Guest',
      key: 'guest',
      width: 220,
      render: (_value, reservation) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14 }}>
            {reservation.guest.firstName} {reservation.guest.lastName}
          </span>
          <span style={{ fontSize: 12, color: 'var(--resort-stone)' }}>{reservation.guest.email}</span>
        </div>
      ),
    },
    {
      title: 'Residence',
      key: 'room',
      width: 200,
      render: (_value, reservation) => {
        const room = roomById.get(reservation.roomId);
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14 }}>{room?.title ?? 'Withdrawn suite'}</span>
            <span className="resort-eyebrow resort-eyebrow--muted" style={{ fontSize: 10 }}>
              {room?.roomNumber ?? '—'}
            </span>
          </div>
        );
      },
    },
    {
      title: 'Stay',
      key: 'stay',
      width: 230,
      sorter: (a, b) => a.checkInDate.localeCompare(b.checkInDate),
      defaultSortOrder: 'descend',
      render: (_value, reservation) => (
        <span style={{ fontSize: 13, color: 'var(--resort-taupe)' }}>
          {dayjs(reservation.checkInDate).format('DD MMM')} → {dayjs(reservation.checkOutDate).format('DD MMM YYYY')} ·{' '}
          {reservation.pricing.totalNights}n
        </span>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'pricing',
      key: 'total',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.pricing.grandTotal - b.pricing.grandTotal,
      render: (pricing: Reservation['pricing']) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          ${pricing.grandTotal.toLocaleString('en-US')}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: Reservation['status']) => <ReservationStatusBadge status={status} size="sm" />,
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 170,
      render: (status: Reservation['paymentStatus']) => <PaymentStatusBadge status={status} size="sm" />,
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_value, reservation) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            onClick={() => setSelectedId(reservation.id)}
            data-testid={`open-reservation-${reservation.bookingReference}`}
            style={{ minHeight: 44 }}
          >
            Open
          </Button>
          <Button
            onClick={() => {
              cancelReservation(reservation.id);
              message.warning({ content: 'Reservation cancelled', duration: 3 });
            }}
            disabled={reservation.status === 'CHECKED_OUT' || reservation.status === 'CANCELLED'}
            data-testid={`cancel-reservation-${reservation.bookingReference}`}
            style={{ minHeight: 44 }}
          >
            Cancel
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminConsoleShell
      eyebrow="Front office"
      title="Reservation register"
      description="Every itinerary captured through the guest site, with folio totals and the actions available for its current state."
      activeSection="/admin/reservations"
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          alignItems: 'flex-end',
        }}
      >
        <label style={{ flex: '1 1 240px', minWidth: 0 }}>
          <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
            Overlapping stay
          </span>
          <RangePicker
            value={window_}
            onChange={(value) => setWindow(value && value[0] && value[1] ? [value[0], value[1]] : null)}
            format="DD MMM YYYY"
            allowClear
            style={{ width: '100%' }}
            data-testid="reservation-window"
          />
        </label>

        <label style={{ flex: '1 1 200px', minWidth: 0 }}>
          <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
            Guest or reference
          </span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Amelia Hartwell"
            allowClear
            data-testid="reservation-search"
          />
        </label>

        <label style={{ flex: '0 1 200px', minWidth: 0 }}>
          <span className="resort-eyebrow resort-eyebrow--muted" style={{ display: 'block', marginBottom: 6 }}>
            Status
          </span>
          <Select
            value={statusFilter}
            onChange={(next: Reservation['status'] | 'ALL') => setStatusFilter(next)}
            style={{ width: '100%' }}
            data-testid="reservation-status-filter"
            options={[
              { value: 'ALL', label: 'All statuses' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'CONFIRMED', label: 'Confirmed' },
              { value: 'CHECKED_IN', label: 'Checked in' },
              { value: 'CHECKED_OUT', label: 'Checked out' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
        </label>
      </div>

      <p className="resort-eyebrow resort-eyebrow--muted" style={{ marginBottom: 12 }} data-testid="reservation-count">
        {filtered.length} {filtered.length === 1 ? 'itinerary' : 'itineraries'} in view
      </p>

      <div className="admin-table-container">
        <Table<Reservation>
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          size="middle"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          data-testid="reservation-register"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No itineraries match the current filters"
              />
            ),
          }}
        />
      </div>

      <ReservationDetailsDrawer
        open={selected !== null}
        reservation={selected}
        room={selected ? (roomById.get(selected.roomId) ?? null) : null}
        addons={addons}
        onClose={() => setSelectedId(null)}
        onCheckIn={(id) => updateReservationStatus(id, 'CHECKED_IN')}
        onCheckOut={(id) => updateReservationStatus(id, 'CHECKED_OUT')}
        onCancel={(id) => cancelReservation(id)}
      />
    </AdminConsoleShell>
  );
}