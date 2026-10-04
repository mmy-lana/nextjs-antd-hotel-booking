import type { ThemeConfig } from 'antd';

export const luxuryResortTheme: ThemeConfig = {
  token: {
    colorPrimary: '#8C704B',
    colorSuccess: '#4E6E58',
    colorWarning: '#B8860B',
    colorError: '#8A3324',
    colorInfo: '#5A6B7C',
    colorTextBase: '#1F1B18',
    colorBgBase: '#FAF8F5',
    colorBorder: '#E5DFD7',
    colorBorderSecondary: '#EFEBE5',
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSize: 15,
    borderRadius: 2,
    borderRadiusLG: 4,
    borderRadiusSM: 1,
    wireframe: false,
    motionDurationFast: '0.15s',
    motionDurationMid: '0.25s',
    motionDurationSlow: '0.35s',
  },
  components: {
    Button: {
      controlHeight: 44,
      borderRadius: 2,
      fontWeight: 500,
      primaryColor: '#FFFFFF',
      defaultBorderColor: '#8C704B',
      defaultColor: '#8C704B',
    },
    DatePicker: {
      controlHeight: 44,
      borderRadius: 2,
    },
    Card: {
      colorBgContainer: '#FFFFFF',
      colorBorderSecondary: '#EAE5DE',
      paddingLG: 24,
    },
    Table: {
      headerBg: '#F3EFE9',
      headerColor: '#1F1B18',
      headerBorderRadius: 2,
      rowHoverBg: '#F9F7F3',
    },
    Drawer: {
      colorBgElevated: '#FCFAF8',
    },
    Modal: {
      colorBgElevated: '#FCFAF8',
    },
  },
};
