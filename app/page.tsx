'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layout, Row, Col, Card, Typography, Tag, Button } from 'antd';
import { useInventoryStore } from '@/lib/store/inventoryStore';
import { useBookingStore } from '@/lib/store/bookingStore';

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const rooms = useInventoryStore((state) => state.rooms);

  useEffect(() => {
    useInventoryStore.persist.rehydrate();
    useBookingStore.persist.rehydrate();
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C704B' }}>
          Loading Sanctuary Inventory...
        </Text>
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#FAF8F5' }}>
      <Header
        style={{
          background: '#FAF8F5',
          borderBottom: '1px solid #E5DFD7',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Title level={3} style={{ margin: 0, letterSpacing: '0.05em', color: '#1F1B18' }}>
            AURA COVE
          </Title>
          <Text style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8C704B' }}>
            Boutique Resort & Spa
          </Text>
        </div>
        <Link href="/admin/rooms">
          <Button type="default" style={{ borderColor: '#8C704B', color: '#8C704B' }}>
            Staff Console
          </Button>
        </Link>
      </Header>

      <Content style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Text style={{ letterSpacing: '0.25em', textTransform: 'uppercase', color: '#8C704B', fontSize: 13 }}>
            Architectural Sanctuaries
          </Text>
          <Title level={1} style={{ margin: '8px 0 16px', color: '#1F1B18' }}>
            Curated Coastal Residences
          </Title>
          <Paragraph style={{ maxWidth: 600, margin: '0 auto', color: '#5A6B7C' }}>
            Immerse yourself in cliffside seclusion, uninterrupted ocean horizons, and dedicated hospitality rituals.
          </Paragraph>
        </div>

        <Row gutter={[24, 24]}>
          {rooms.map((room) => (
            <Col xs={24} sm={12} lg={8} key={room.id}>
              <Card
                hoverable
                cover={
                  <div style={{ position: 'relative', overflow: 'hidden' }}>
                    <img
                      src={room.images[0]?.url}
                      alt={room.title}
                      className="room-card-media"
                    />
                    <div style={{ position: 'absolute', top: 12, right: 12 }}>
                      <Tag color="#4E6E58">{room.viewType}</Tag>
                    </div>
                  </div>
                }
                styles={{ body: { padding: 20 } }}
              >
                <Text style={{ fontSize: 12, color: '#8C704B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {room.category.replace('-', ' ')}
                </Text>
                <Title level={4} style={{ margin: '4px 0 8px', color: '#1F1B18' }}>
                  {room.title}
                </Title>
                <Paragraph ellipsis={{ rows: 2 }} style={{ color: '#5A6B7C', fontSize: 14, minHeight: 42 }}>
                  {room.tagline}
                </Paragraph>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 }}>
                  <div>
                    <Text style={{ fontSize: 20, fontWeight: 600, color: '#8C704B' }}>
                      ${room.basePricePerNight.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#5A6B7C' }}> / night</Text>
                  </div>
                  <Link href={`/rooms/${room.slug}`}>
                    <Button type="primary">Explore Suite</Button>
                  </Link>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Content>

      <Footer style={{ textAlign: 'center', background: '#F3EFE9', borderTop: '1px solid #E5DFD7', padding: '24px' }}>
        <Text style={{ fontSize: 13, color: '#5A6B7C' }}>
          Aura Cove Sanctuary Resort &copy; 2026. All rights reserved.
        </Text>
      </Footer>
    </Layout>
  );
}
