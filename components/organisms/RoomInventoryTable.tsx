'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, InputNumber, Popconfirm, Select, Table, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { reservationsSpanningDate } from '@/lib/utils/availability';
import { ROOM_CATEGORY_LABEL } from '@/components/molecules/RoomCard';
import { RoomStatusBadge, ROOM_STATUS_PRESENTATION } from '@/components/primitives/StatusBadge';
import type { Reservation, Room, RoomStatus } from '@/types/booking';

export interface RoomInventoryTableProps {
  /** Suites to display. */
  rooms: Room[];
  /** Itineraries used to derive live occupancy for each suite. */
  reservations: Reservation[];
  /** Opens the editor modal for a new suite. */
  onCreate: () => void;
  /** Opens the editor modal for an existing suite. */
  onEdit: (room: Room) => void;
  /** Applies an inline status change. */
  onStatusChange: (roomId: string, status: RoomStatus) => void;
  /** Applies an inline nightly rate change. */
  onRateChange: (roomId: string, field: 'basePricePerNight' | 'weekendPricePerNight', value: number) => void;
  /** Removes a suite from the catalogue. */
  onDelete: (room: Room) => void;
  /** Extra class applied to the scroll container. */
  className?: string;
}

/** Nights of itinerary shown on each row so the concierge sees live occupancy. */
function occupancySummary(room: Room, reservations: Reservation[], referenceDate: string) {
  const spanning = reservationsSpanningDate(room.id, referenceDate, reservations);
  if (spanning.length === 0) {
    return 'Free tonight';
  }
  const active = spanning[spanning.length - 1];
  return `${active.bookingReference} · ${active.guest.firstName} ${active.guest.lastName}`;
}

/**
 * Concierge room inventory matrix.
 *
 * The table scrolls horizontally below its minimum column width rather than reflowing,
 * which keeps rate columns aligned on a phone. Status and rate edits are made in place
 * so routine housekeeping never opens a modal.
 */
export function RoomInventoryTable({
  rooms,
  reservations,
  onCreate,
  onEdit,
  onStatusChange,
  onRateChange,
  onDelete,
  className,
}: RoomInventoryTableProps) {
  const { message } = App.useApp();
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const referenceDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const commitRate = (room: Room, field: 'basePricePerNight' | 'weekendPricePerNight', value: number | null) => {
    if (value === null || Number.isNaN(value) || value <= 0) {
      message.error({ content: 'Enter a nightly rate greater than zero', duration: 3 });
      setRateDrafts((current) => {
        const next = { ...current };
        delete next[`${room.id}:${field}`];
        return next;
      });
      return;
    }
    if (value === room[field]) {
      return;
    }
    onRateChange(room.id, field, Math.round(value));
    message.success({ content: `${room.roomNumber} rate updated`, duration: 2 });
  };

  const columns: TableColumnsType<Room> = useMemo(
    () => [
      {
        title: 'Residence',
        dataIndex: 'roomNumber',
        key: 'roomNumber',
        fixed: 'left',
        width: 220,
        sorter: (a, b) => a.roomNumber.localeCompare(b.roomNumber),
        defaultSortOrder: 'ascend',
        render: (_value, room) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{room.title}</span>
            <span className="resort-eyebrow resort-eyebrow--muted" style={{ fontSize: 10 }}>
              {room.roomNumber} · {ROOM_CATEGORY_LABEL[room.category]}
            </span>
          </div>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 190,
        filters: (Object.keys(ROOM_STATUS_PRESENTATION) as RoomStatus[]).map((status) => ({
          text: ROOM_STATUS_PRESENTATION[status].label,
          value: status,
        })),
        onFilter: (value, room) => room.status === value,
        render: (status: RoomStatus, room) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <RoomStatusBadge status={status} size="sm" />
            <Select
              size="small"
              value={status}
              aria-label={`Set status for ${room.roomNumber}`}
              data-testid={`status-select-${room.roomNumber}`}
              style={{ width: '100%' }}
              onChange={(next: RoomStatus) => onStatusChange(room.id, next)}
              options={(Object.keys(ROOM_STATUS_PRESENTATION) as RoomStatus[]).map((value) => ({
                value,
                label: ROOM_STATUS_PRESENTATION[value].label,
              }))}
            />
          </div>
        ),
      },
      {
        title: 'Outlook',
        dataIndex: 'viewType',
        key: 'viewType',
        width: 150,
        sorter: (a, b) => a.viewType.localeCompare(b.viewType),
        filters: [...new Set(rooms.map((room) => room.viewType))].map((view) => ({ text: view, value: view })),
        onFilter: (value, room) => room.viewType === value,
        render: (viewType: Room['viewType']) => <span style={{ fontSize: 13 }}>{viewType}</span>,
      },
      {
        title: 'Sleeps',
        key: 'occupancy',
        width: 140,
        sorter: (a, b) =>
          a.maxOccupancy.adults + a.maxOccupancy.children - (b.maxOccupancy.adults + b.maxOccupancy.children),
        render: (_value, room) => (
          <span style={{ fontSize: 13, color: 'var(--resort-taupe)' }}>
            {room.maxOccupancy.adults}A · {room.maxOccupancy.children}C · {room.maxOccupancy.infants}I
          </span>
        ),
      },
      {
        title: 'Nightly rate',
        dataIndex: 'basePricePerNight',
        key: 'basePricePerNight',
        width: 150,
        sorter: (a, b) => a.basePricePerNight - b.basePricePerNight,
        render: (value: number, room) => (
          <InputNumber
            aria-label={`Nightly rate for ${room.roomNumber}`}
            data-testid={`base-rate-${room.roomNumber}`}
            min="1"
            step="25"
            prefix="$"
            controls={false}
            value={rateDrafts[`${room.id}:base`] ?? String(value)}
            onChange={(next) => setRateDrafts((current) => ({ ...current, [`${room.id}:base`]: String(next ?? '') }))}
            onBlur={(event) => {
              const parsed = Number((event.target as HTMLInputElement).value);
              setRateDrafts((current) => {
                const next = { ...current };
                delete next[`${room.id}:base`];
                return next;
              });
              commitRate(room, 'basePricePerNight', Number.isFinite(parsed) ? parsed : null);
            }}
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: 'Weekend rate',
        dataIndex: 'weekendPricePerNight',
        key: 'weekendPricePerNight',
        width: 150,
        sorter: (a, b) => a.weekendPricePerNight - b.weekendPricePerNight,
        render: (value: number, room) => (
          <InputNumber
            aria-label={`Weekend rate for ${room.roomNumber}`}
            data-testid={`weekend-rate-${room.roomNumber}`}
            min="1"
            step="25"
            prefix="$"
            controls={false}
            value={rateDrafts[`${room.id}:weekend`] ?? String(value)}
            onChange={(next) => setRateDrafts((current) => ({ ...current, [`${room.id}:weekend`]: String(next ?? '') }))}
            onBlur={(event) => {
              const parsed = Number((event.target as HTMLInputElement).value);
              setRateDrafts((current) => {
                const next = { ...current };
                delete next[`${room.id}:weekend`];
                return next;
              });
              commitRate(room, 'weekendPricePerNight', Number.isFinite(parsed) ? parsed : null);
            }}
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: "Tonight's occupancy",
        key: 'occupancySummary',
        width: 210,
        render: (_value, room) => (
          <span style={{ fontSize: 13, color: 'var(--resort-taupe)' }}>
            {occupancySummary(room, reservations, referenceDate)}
          </span>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        fixed: 'right',
        width: 120,
        render: (_value, room) => (
          <div style={{ display: 'flex', gap: 6 }}>
            <Tooltip title="Edit suite">
              <Button
                aria-label={`Edit ${room.roomNumber}`}
                icon={<EditOutlined />}
                data-testid={`edit-room-${room.roomNumber}`}
                onClick={() => onEdit(room)}
                style={{ minWidth: 44, minHeight: 44 }}
              />
            </Tooltip>
            <Popconfirm
              title={`Withdraw ${room.roomNumber}?`}
              description="Only available when the suite has no live itineraries."
              okText="Withdraw"
              cancelText="Keep"
              onConfirm={() => onDelete(room)}
            >
              <Button
                aria-label={`Withdraw ${room.roomNumber}`}
                danger
                icon={<DeleteOutlined />}
                data-testid={`delete-room-${room.roomNumber}`}
                style={{ minWidth: 44, minHeight: 44 }}
              />
            </Popconfirm>
          </div>
        ),
      },
    ],
    [onDelete, onEdit, onStatusChange, rateDrafts, referenceDate, reservations, rooms],
  );

  return (
    <div className={className}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <span className="resort-eyebrow resort-eyebrow--muted">
          {rooms.length} {rooms.length === 1 ? 'residence' : 'residences'} in inventory
        </span>
        <Button type="primary" onClick={onCreate} data-testid="add-room" style={{ minHeight: 44 }}>
          Add residence
        </Button>
      </div>

      <div className="admin-table-container">
        <Table<Room>
          rowKey="id"
          columns={columns}
          dataSource={rooms}
          size="middle"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          data-testid="room-inventory-table"
        />
      </div>
    </div>
  );
}