import type { ThemeConfig } from 'antd';

/**
 * Aura Cove design tokens.
 *
 * The palette is deliberately narrow: warm sand and ivory grounds, a single
 * burnished bronze accent, deep espresso ink, and four semantic tones drawn from
 * the resort landscape (sage, goldenrod, terracotta, slate). Geometry is sharp —
 * a 2px radius reads as architectural rather than consumer-software.
 *
 * Heading typography is set in the display serif stack so editorial moments
 * (suite names, section titles, prices) feel printed, while all functional data
 * stays in the sans stack for legibility.
 */
export const luxuryResortTheme: ThemeConfig = {
  token: {
    // Palette: Sand, Bronze, Espresso, Warm Ivory
    colorPrimary: '#8C704B', // Refined Bronze
    colorSuccess: '#4E6E58', // Deep Sage
    colorWarning: '#B8860B', // Dark Goldenrod
    colorError: '#8A3324', // Terracotta Crimson
    colorInfo: '#5A6B7C', // Slate Blue
    colorTextBase: '#1F1B18', // Deep Espresso Charcoal
    colorText: '#1F1B18',
    colorTextSecondary: '#4A423B',
    colorTextTertiary: '#7A6F64',
    colorTextQuaternary: '#9C9186',
    colorTextPlaceholder: '#A79C90',
    colorBgBase: '#FAF8F5', // Sand Silk Ivory
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FCFAF8',
    colorBgLayout: '#FAF8F5',
    colorFillAlter: '#F3EFE9',
    colorFillSecondary: '#F3EFE9',
    colorFillTertiary: '#EFEAE3',
    colorBorder: '#E5DFD7', // Subtle Linen Border
    colorBorderSecondary: '#EFEBE5',

    // Typography
    fontFamily:
      '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 17,
    fontSize: 15,
    fontSizeSM: 13,
    fontSizeLG: 17,
    lineHeight: 1.65,
    lineHeightHeading1: 1.18,
    lineHeightHeading2: 1.22,
    lineHeightHeading3: 1.28,
    fontWeightStrong: 600,

    // Geometry & Motion
    borderRadius: 2, // Sharp architectural minimalist radius
    borderRadiusLG: 4,
    borderRadiusSM: 1,
    borderRadiusXS: 1,
    wireframe: false,
    controlHeight: 44,
    controlHeightLG: 48,
    controlHeightSM: 34,

    // Transitions
    motionDurationFast: '0.15s',
    motionDurationMid: '0.25s',
    motionDurationSlow: '0.35s',
    motionEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  },
  components: {
    Button: {
      controlHeight: 44,
      borderRadius: 2,
      fontWeight: 500,
      primaryColor: '#FFFFFF',
      defaultBorderColor: '#8C704B',
      defaultColor: '#8C704B',
      defaultShadow: 'none',
      primaryShadow: 'none',
      dangerShadow: 'none',
      defaultBg: 'transparent',
      paddingContentHorizontal: 22,
      fontSize: 14,
    },
    DatePicker: {
      controlHeight: 44,
      borderRadius: 2,
      cellActiveWithRangeBg: '#F1EBE1',
    },
    Input: {
      controlHeight: 44,
      borderRadius: 2,
      activeShadow: '0 0 0 2px rgba(140, 112, 75, 0.14)',
      paddingBlock: 10,
    },
    InputNumber: {
      controlHeight: 44,
      borderRadius: 2,
      activeShadow: '0 0 0 2px rgba(140, 112, 75, 0.14)',
    },
    Select: {
      controlHeight: 44,
      borderRadius: 2,
      activeOutlineColor: 'rgba(140, 112, 75, 0.14)',
      optionSelectedBg: '#F1EBE1',
    },
    Card: {
      colorBgContainer: '#FFFFFF',
      colorBorderSecondary: '#EAE5DE',
      paddingLG: 24,
      headerFontSize: 16,
      borderRadiusLG: 4,
    },
    Table: {
      headerBg: '#F3EFE9',
      headerColor: '#1F1B18',
      headerBorderRadius: 2,
      rowHoverBg: '#F9F7F3',
      borderColor: '#EDE7DF',
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
    },
    Drawer: {
      colorBgElevated: '#FCFAF8',
      paddingLG: 24,
    },
    Modal: {
      colorBgElevated: '#FCFAF8',
      headerBg: '#FCFAF8',
      borderRadiusLG: 4,
      titleFontSize: 20,
    },
    Tag: {
      borderRadiusSM: 1,
      defaultBg: '#F3EFE9',
      defaultColor: '#4A423B',
    },
    Tabs: {
      titleFontSize: 14,
      horizontalItemPadding: '14px 0',
      horizontalItemGutter: 28,
      inkBarColor: '#8C704B',
    },
    Segmented: {
      itemSelectedBg: '#FFFFFF',
      itemSelectedColor: '#1F1B18',
      trackBg: '#F3EFE9',
      borderRadius: 2,
    },
    Form: {
      labelColor: '#4A423B',
      labelFontSize: 13,
      verticalLabelPadding: '0 0 6px',
      itemMarginBottom: 20,
    },
    // Ant Design v6 removed the heading font and heading-weight tokens; the display
    // serif for `h1`-`h5` is applied through the `resort-display` CSS layer in globals.css.
    Statistic: {
      contentFontSize: 26,
      titleFontSize: 12,
    },
    Empty: {
      colorTextDescription: '#7A6F64',
    },
    Popconfirm: {
      borderRadiusLG: 4,
    },
    Divider: {
      colorSplit: '#EAE5DE',
    },
  },
};