'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { AdminConsoleShell, type ConsoleMetric } from '@/components/templates/AdminConsoleShell';
import { reservationsSpanningDate } from '@/lib/utils/availability';
import { RoomInventoryTable } from '@/components/organisms/RoomInventoryTable';
import { RoomEditorModal, type RoomEditorPayload } from '@/components/organisms/RoomEditorModal';
import type { Room, RoomStatus } from '@/types/booking';

/**
 * Derives a URL-safe slug from a residence name and guarantees it is unique within
 * the live catalogue. Existing suites keep their slug when the name changes, so
 * published links never break.
 */
function uniqueSlug(title: string, existing: Room[], ignoreId?: string): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'residence';

  const taken = new Set(
    existing.filter((room) => room.id !== ignoreId).map((room) => room.slug),
  );
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export default function AdminRoomsPage() {
  const { message } = App.useApp();
  const rooms = useInventoryStore((state) => state.rooms);
  const reservations = useInventoryStore((state) => state.reservations);
  const addRoom = useInventoryStore((state) => state.addRoom);
  const updateRoom = useInventoryStore((state) => state.updateRoom);
  const deleteRoom = useInventoryStore((state) => state.deleteRoom);
  const updateRoomStatus = useInventoryStore((state) => state.updateRoomStatus);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const today = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  const metrics = useMemo<ConsoleMetric[]>(() => {
    const occupiedTonight = rooms.filter(
      (room) => reservationsSpanningDate(room.id, today, reservations).length > 0,
    ).length;
    const bookable = rooms.filter(
      (room) => room.status === 'AVAILABLE' || room.status === 'RESERVED',
    ).length;
    const withdrawn = rooms.filter(
      (room) => room.status === 'MAINTENANCE' || room.status === 'CLEANING',
    ).length;
    const arrivals = reservations.filter((reservation) => {
      const status = reservation.status;
      return (
        reservation.checkInDate <= today &&
        reservation.checkOutDate > today &&
        status !== 'CANCELLED' &&
        status !== 'CHECKED_OUT'
      );
    }).length;
    const nightlyRevenue = reservations
      .filter((reservation) => reservation.status !== 'CANCELLED')
      .reduce((sum, reservation) => sum + reservation.pricing.grandTotal, 0);

    return [
      { label: 'In inventory', value: String(rooms.length), hint: `${bookable} bookable` },
      { label: 'Occupied tonight', value: String(occupiedTonight), hint: `${arrivals} in house` },
      { label: 'Withdrawn', value: String(withdrawn), hint: 'Maintenance or housekeeping' },
      {
        label: 'Booked value',
        value: `$${nightlyRevenue.toLocaleString('en-US')}`,
        hint: 'Across all live itineraries',
      },
    ];
  }, [reservations, rooms, today]);

  const openCreate = useCallback(() => {
    setEditingRoom(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((room: Room) => {
    setEditingRoom(room);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => setEditorOpen(false), []);

  const handleSubmit = useCallback(
    (payload: RoomEditorPayload) => {
      const { id, ...values } = payload;
      if (id) {
        updateRoom(id, values);
        message.success({ content: `${values.roomNumber} updated`, duration: 2 });
      } else {
        addRoom({ ...values, slug: uniqueSlug(values.title, rooms) });
        message.success({ content: `${values.roomNumber} added to inventory`, duration: 2 });
      }
      setEditorOpen(false);
      setEditingRoom(null);
    },
    [addRoom, message, rooms, updateRoom],
  );

  const handleStatusChange = useCallback(
    (roomId: string, status: RoomStatus) => {
      updateRoomStatus(roomId, status);
      message.success({ content: `Status set to ${status.replace('_', ' ').toLowerCase()}`, duration: 2 });
    },
    [message, updateRoomStatus],
  );

  const handleRateChange = useCallback(
    (roomId: string, field: 'basePricePerNight' | 'weekendPricePerNight', value: number) => {
      updateRoom(roomId, { [field]: value });
    },
    [updateRoom],
  );

  const handleDelete = useCallback(
    (room: Room) => {
      try {
        deleteRoom(room.id);
        message.success({ content: `${room.roomNumber} withdrawn`, duration: 2 });
      } catch (error) {
        message.error({
          content: error instanceof Error ? error.message : 'The suite could not be withdrawn.',
          duration: 4,
        });
      }
    },
    [deleteRoom, message],
  );

  return (
    <AdminConsoleShell
      eyebrow="Front office"
      title="Suite inventory"
      description="Maintain operational status, nightly rates and catalogue details for every residence."
      activeSection="/admin/rooms"
      metrics={metrics}
    >
      <RoomInventoryTable
        rooms={rooms}
        reservations={reservations}
        onCreate={openCreate}
        onEdit={openEdit}
        onStatusChange={handleStatusChange}
        onRateChange={handleRateChange}
        onDelete={handleDelete}
      />

      <RoomEditorModal
        open={editorOpen}
        room={editingRoom}
        onClose={closeEditor}
        onSubmit={handleSubmit}
      />
    </AdminConsoleShell>
  );
}