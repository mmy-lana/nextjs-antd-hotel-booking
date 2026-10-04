'use client';

import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import { luxuryResortTheme } from '@/lib/theme/themeConfig';

export function AntdProviders({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider theme={luxuryResortTheme}>
        {children}
      </ConfigProvider>
    </AntdRegistry>
  );
}
