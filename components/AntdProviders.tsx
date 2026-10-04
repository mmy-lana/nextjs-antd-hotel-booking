'use client';

import React, { useMemo } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import { luxuryResortTheme } from '@/lib/theme/themeConfig';

export interface AntdProvidersProps {
  children: React.ReactNode;
}

/**
 * Client boundary that owns every browser-only Ant Design concern.
 *
 * - `AntdRegistry` collects the cssinjs styles generated during the server render so the
 *   first paint is already styled instead of flashing unstyled markup.
 * - `ConfigProvider` applies the resort design tokens and pins the English locale so
 *   date pickers and empty states never fall back to browser defaults.
 * - `App` installs the static-function message/notification context used by drawers,
 *   modals and forms in later phases; without it `message.success` warns at runtime.
 */
export function AntdProviders({ children }: AntdProvidersProps) {
  const themeConfig = useMemo(() => luxuryResortTheme, []);

  return (
    <AntdRegistry>
      <ConfigProvider locale={enUS} theme={themeConfig} componentSize="middle">
        <AntdApp
          message={{
            maxCount: 3,
            duration: 3,
            top: 88,
          }}
          notification={{
            placement: 'topRight',
            top: 88,
          }}
        >
          {children}
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}

dayjs.locale('en');