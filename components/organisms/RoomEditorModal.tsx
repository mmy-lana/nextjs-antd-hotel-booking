'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { PlusOutlined } from '@ant-design/icons';
import {
  RoomCreateSchema,
  RoomUpdateSchema,
  zodIssuesToFieldErrors,
} from '@/schemas/validation';
import { ROOM_CATEGORY_LABEL } from '@/components/molecules/RoomCard';
import type { Amenity, Room, RoomCategory, RoomImage, RoomStatus } from '@/types/booking';

const { TextArea } = Input;

/** Shape the modal collects; matches `RoomCreateSchema` after Zod parsing. */
export interface RoomEditorValues {
  roomNumber: string;
  title: string;
  category: RoomCategory;
  tagline: string;
  description: string;
  basePricePerNight: number;
  weekendPricePerNight: number;
  resortFeePerNight: number;
  cleaningFee: number;
  squareMeters: number;
  maxOccupancy: { adults: number; children: number; infants: number };
  bedConfiguration: string;
  status: RoomStatus;
  viewType: Room['viewType'];
  amenities: Amenity[];
  images: RoomImage[];
}

/** Ant Design does not re-export `FieldData` in v6, so it is derived from the instance. */
type FieldData = Parameters<FormInstance<RoomEditorValues>['setFields']>[0] extends ReadonlyArray<
  infer TEntry
>
  ? TEntry
  : never;

/** The value handed back to the caller after Zod validation. */
export type RoomEditorPayload = RoomEditorValues & { id?: string };

export interface RoomEditorModalProps {
  /** Modal visibility. */
  open: boolean;
  /** Suite being edited; `null` opens the modal in create mode. */
  room: Room | null;
  /** Called when the modal is dismissed. */
  onClose: () => void;
  /** Receives the validated payload for persistence. */
  onSubmit: (payload: RoomEditorPayload) => void;
}

const VIEW_TYPES: Room['viewType'][] = ['Ocean Front', 'Tropical Garden', 'Panoramic Cliff', 'Private Lagoon'];

const AMENITY_CATEGORIES: Amenity['category'][] = ['wellness', 'convenience', 'view', 'dining'];

/** Icon keys the amenity form offers; the renderer falls back to a neutral mark. */
const ICON_KEYS = [
  'pool',
  'ocean',
  'concierge',
  'wine',
  'bath',
  'eye',
  'coffee',
  'fire',
  'lotus',
  'kitchen',
  'key',
  'terrace',
];

const EMPTY_VALUES: RoomEditorValues = {
  roomNumber: '',
  title: '',
  category: 'cliffside-villa',
  tagline: '',
  description: '',
  basePricePerNight: 0,
  weekendPricePerNight: 0,
  resortFeePerNight: 0,
  cleaningFee: 0,
  squareMeters: 0,
  maxOccupancy: { adults: 2, children: 0, infants: 0 },
  bedConfiguration: '',
  status: 'AVAILABLE',
  viewType: 'Ocean Front',
  amenities: [],
  images: [],
};

const SECTION_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 12,
};

/**
 * Add/edit modal for the suite catalogue.
 *
 * The form is always `layout="vertical"` so labels never truncate inside the modal or
 * when the modal is narrowed to a phone. Submissions are validated by the same Zod
 * schema the domain layer uses, and the resulting issues are mapped back onto the
 * offending fields so the concierge never has to guess what is wrong.
 */
export function RoomEditorModal({ open, room, onClose, onSubmit }: RoomEditorModalProps) {
  const [form] = Form.useForm<RoomEditorValues>();

  useEffect(() => {
    if (!open) {
      return;
    }
    if (room) {
      form.setFieldsValue({
        ...room,
        amenities: room.amenities.map((amenity) => ({ ...amenity })),
        images: room.images.map((image) => ({ ...image })),
        maxOccupancy: { ...room.maxOccupancy },
      });
    } else {
      form.setFieldsValue(EMPTY_VALUES);
    }
  }, [form, open, room]);

  const handleCancel = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  const handleSubmit = useCallback(async () => {
    let values: RoomEditorValues;
    try {
      values = await form.validateFields();
    } catch {
      // Ant Design has already rendered the inline messages for the invalid fields.
      return;
    }

    const candidate: Record<string, unknown> = {
      ...values,
      amenities: values.amenities ?? [],
      images: (values.images ?? []).map((image, index) => ({
        ...image,
        isPrimary: index === 0 || image.isPrimary,
      })),
    };
    if (room) {
      candidate.id = room.id;
    }

    const parsed = room ? RoomUpdateSchema.safeParse(candidate) : RoomCreateSchema.safeParse(candidate);

    if (!parsed.success) {
      const issues: FieldData[] = [];
      for (const [path, field] of Object.entries(zodIssuesToFieldErrors(parsed.error))) {
        // List indices must be numbers for `Form.List` to attach the error to the right row.
        const name = path
          .split('.')
          .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
        issues.push({ name: name as FieldData['name'], errors: field.errors });
      }
      if (issues.length > 0) {
        form.setFields(issues);
      }
      return;
    }

    onSubmit({ ...parsed.data, id: room?.id });
  }, [form, onSubmit, room]);

  const title = useMemo(() => (room ? `Edit ${room.roomNumber}` : 'Add a residence'), [room]);

  return (
    <Modal
      open={open}
      title={title}
      onCancel={handleCancel}
      onOk={handleSubmit}
      okText={room ? 'Save changes' : 'Add residence'}
      cancelText="Cancel"
      width="min(860px, calc(100vw - 32px))"
      destroyOnHidden
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' }, header: { borderBottom: '1px solid var(--resort-border)' } }}
      data-testid="room-editor-modal"
    >
      <Form<RoomEditorValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={EMPTY_VALUES}
        data-testid="room-editor-form"
      >
        <p className="resort-eyebrow resort-eyebrow--muted" style={{ marginBottom: 8 }}>
          Identity
        </p>
        <div style={SECTION_GRID}>
          <Form.Item
            name="roomNumber"
            label="Room number"
            rules={[{ required: true, message: 'Room number is mandatory' }]}
          >
            <Input data-testid="editor-room-number" placeholder="V-101" />
          </Form.Item>
          <Form.Item
            name="title"
            label="Residence name"
            rules={[{ required: true, min: 3, message: 'Title must be at least 3 characters' }]}
          >
            <Input data-testid="editor-title" placeholder="The Cliffside Sanctuary" />
          </Form.Item>
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select
              data-testid="editor-category"
              options={(Object.keys(ROOM_CATEGORY_LABEL) as RoomCategory[]).map((value) => ({
                value,
                label: ROOM_CATEGORY_LABEL[value],
              }))}
            />
          </Form.Item>
          <Form.Item name="viewType" label="Outlook" rules={[{ required: true }]}>
            <Select
              data-testid="editor-view"
              options={VIEW_TYPES.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="tagline"
            label="Tagline"
            rules={[{ required: true, min: 5, message: 'Tagline must be at least 5 characters' }]}
          >
            <Input data-testid="editor-tagline" />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select
              data-testid="editor-status"
              options={(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'CLEANING'] as RoomStatus[]).map(
                (value) => ({ value, label: value.replace('_', ' ') }),
              )}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, min: 20, message: 'Description must be at least 20 characters' }]}
          style={{ marginTop: 12 }}
        >
          <TextArea rows={3} data-testid="editor-description" />
        </Form.Item>

        <p className="resort-eyebrow resort-eyebrow--muted" style={{ marginBottom: 8, marginTop: 8 }}>
          Rates and scale
        </p>
        <div style={SECTION_GRID}>
          <Form.Item
            name="basePricePerNight"
            label="Base rate per night"
            rules={[{ required: true, type: 'number', min: 1, message: 'Base price must be greater than zero' }]}
          >
            <InputNumber prefix="$" min="1" step="25" controls={false} style={{ width: '100%' }} data-testid="editor-base-rate" />
          </Form.Item>
          <Form.Item
            name="weekendPricePerNight"
            label="Weekend rate per night"
            rules={[{ required: true, type: 'number', min: 1, message: 'Weekend rate must be greater than zero' }]}
          >
            <InputNumber prefix="$" min="1" step="25" controls={false} style={{ width: '100%' }} data-testid="editor-weekend-rate" />
          </Form.Item>
          <Form.Item
            name="resortFeePerNight"
            label="Resort fee per night"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber prefix="$" min="0" step="5" controls={false} style={{ width: '100%' }} data-testid="editor-resort-fee" />
          </Form.Item>
          <Form.Item name="cleaningFee" label="Cleaning fee" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber prefix="$" min="0" step="10" controls={false} style={{ width: '100%' }} data-testid="editor-cleaning-fee" />
          </Form.Item>
          <Form.Item
            name="squareMeters"
            label="Interior area (m²)"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber min="1" step="5" controls={false} style={{ width: '100%' }} data-testid="editor-square-meters" />
          </Form.Item>
          <Form.Item
            name={['maxOccupancy', 'adults']}
            label="Maximum adults"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber min="1" max="12" controls={false} style={{ width: '100%' }} data-testid="editor-max-adults" />
          </Form.Item>
          <Form.Item
            name={['maxOccupancy', 'children']}
            label="Maximum children"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber min="0" max="12" controls={false} style={{ width: '100%' }} data-testid="editor-max-children" />
          </Form.Item>
          <Form.Item
            name={['maxOccupancy', 'infants']}
            label="Maximum infants"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber min="0" max="6" controls={false} style={{ width: '100%' }} data-testid="editor-max-infants" />
          </Form.Item>
          <Form.Item
            name="bedConfiguration"
            label="Bedding"
            rules={[{ required: true, min: 2, message: 'Describe the bedding arrangement' }]}
          >
            <Input data-testid="editor-bedding" placeholder="1 King Bed + 1 Daybed Lounge" />
          </Form.Item>
        </div>

        <p className="resort-eyebrow resort-eyebrow--muted" style={{ marginBottom: 8, marginTop: 8 }}>
          Showcase imagery
        </p>
        <Form.List
          name="images"
          rules={[
            {
              validator: async (_, images: RoomImage[]) => {
                if (!images || images.length === 0) {
                  throw new Error('At least one room showcase image required');
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 8,
                    padding: 12,
                    marginBottom: 8,
                    border: '1px solid var(--resort-border-soft)',
                    borderRadius: 'var(--resort-radius)',
                  }}
                >
                  <Form.Item
                    name={[field.name, 'url']}
                    label="Image URL"
                    rules={[{ required: true, type: 'url', message: 'Must be a valid high-resolution image URL' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input data-testid={`editor-image-url-${field.name}`} placeholder="https://images.unsplash.com/..." />
                  </Form.Item>
                  <div style={SECTION_GRID}>
                    <Form.Item
                      name={[field.name, 'altText']}
                      label="Alternative text"
                      rules={[{ required: true, min: 3, message: 'Alternative text is required' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input data-testid={`editor-image-alt-${field.name}`} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'caption']}
                      label="Caption"
                      rules={[{ required: true, min: 2 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input data-testid={`editor-image-caption-${field.name}`} />
                    </Form.Item>
                  </div>
                  <Button
                    danger
                    onClick={() => remove(field.name)}
                    style={{ minHeight: 44, justifySelf: 'start' }}
                    data-testid={`editor-image-remove-${field.name}`}
                  >
                    Remove image
                  </Button>
                </div>
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                icon={<PlusOutlined />}
                onClick={() => add({ url: '', altText: '', caption: '', isPrimary: fields.length === 0 })}
                style={{ minHeight: 44 }}
                data-testid="editor-image-add"
              >
                Add image
              </Button>
            </>
          )}
        </Form.List>

        <p className="resort-eyebrow resort-eyebrow--muted" style={{ marginBottom: 8, marginTop: 20 }}>
          Amenities
        </p>
        <Form.List name="amenities">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 8,
                    padding: 12,
                    marginBottom: 8,
                    border: '1px solid var(--resort-border-soft)',
                    borderRadius: 'var(--resort-radius)',
                  }}
                >
                  <Form.Item
                    name={[field.name, 'name']}
                    label="Amenity"
                    rules={[{ required: true, min: 2 }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input data-testid={`editor-amenity-name-${field.name}`} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'category']}
                    label="Category"
                    rules={[{ required: true }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      data-testid={`editor-amenity-category-${field.name}`}
                      options={AMENITY_CATEGORIES.map((value) => ({ value, label: value }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'iconKey']}
                    label="Icon"
                    rules={[{ required: true, min: 1 }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      data-testid={`editor-amenity-icon-${field.name}`}
                      options={ICON_KEYS.map((value) => ({ value, label: value }))}
                    />
                  </Form.Item>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Form.Item
                      name={[field.name, 'description']}
                      label="Description"
                      rules={[{ required: true, min: 5 }]}
                      style={{ marginBottom: 0 }}
                    >
                      <TextArea rows={2} data-testid={`editor-amenity-description-${field.name}`} />
                    </Form.Item>
                  </div>
                  <Button
                    danger
                    onClick={() => remove(field.name)}
                    style={{ minHeight: 44, justifySelf: 'start' }}
                    data-testid={`editor-amenity-remove-${field.name}`}
                  >
                    Remove amenity
                  </Button>
                </div>
              ))}
              <Button
                icon={<PlusOutlined />}
                onClick={() => add({ name: '', category: 'wellness', iconKey: 'pool', description: '' })}
                style={{ minHeight: 44 }}
                data-testid="editor-amenity-add"
              >
                Add amenity
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}