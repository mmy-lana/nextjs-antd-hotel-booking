import type { CSSProperties, ReactNode } from 'react';

export type SectionHeaderAlign = 'left' | 'center';

export interface SectionHeaderProps {
  /** Editorial title rendered in the display serif. */
  title: string;
  /** Small uppercase label rendered above the title. */
  eyebrow?: string;
  /** Supporting copy rendered beneath the title. */
  description?: ReactNode;
  /** Horizontal alignment of the whole block. */
  align?: SectionHeaderAlign;
  /**
   * Heading level for document outline correctness.
   * Section titles on the landing page use `2`; the page hero uses `1`.
   */
  level?: 1 | 2 | 3 | 4;
  /** Optional trailing control, typically a text link or a secondary button. */
  trailing?: ReactNode;
  /** Id applied to the heading so an in-page skip link can target it. */
  id?: string;
  /** Extra class applied to the wrapper. */
  className?: string;
  /** Inline style escape hatch. */
  style?: CSSProperties;
}

const TITLE_MARGIN: Record<NonNullable<SectionHeaderProps['level']>, string> = {
  1: '0 0 16px',
  2: '0 0 14px',
  3: '0 0 10px',
  4: '0 0 8px',
};

const TITLE_TAGS = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
} as const;

/**
 * Editorial section header.
 *
 * Pairs a serif title with a tracked uppercase eyebrow and an optional lede. When
 * `trailing` is supplied the title row becomes a two-column layout so an action never
 * squeezes the title, while the eyebrow and lede stay full width.
 */
export function SectionHeader({
  title,
  eyebrow,
  description,
  align = 'left',
  level = 2,
  trailing,
  id,
  className,
  style,
}: SectionHeaderProps) {
  const centred = align === 'center';
  const TitleTag = TITLE_TAGS[level];

  return (
    <header
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: centred ? 'center' : 'stretch',
        textAlign: centred ? 'center' : 'left',
        ...style,
      }}
      data-testid="section-header"
    >
      {eyebrow ? (
        <p className="resort-eyebrow" style={{ marginBottom: 10 }}>
          {eyebrow}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: centred ? 'center' : trailing ? 'space-between' : 'flex-start',
          columnGap: 20,
          rowGap: 8,
          width: '100%',
        }}
      >
        <TitleTag id={id} style={{ margin: TITLE_MARGIN[level], minWidth: 0 }}>
          {title}
        </TitleTag>

        {trailing ? <div style={{ flexShrink: 0, paddingBottom: 4 }}>{trailing}</div> : null}
      </div>

      {description ? (
        <div
          className="resort-lede"
          style={{
            marginTop: 12,
            marginInline: centred ? 'auto' : 0,
            fontSize: level === 1 ? '1.0625rem' : '1rem',
          }}
        >
          {description}
        </div>
      ) : null}
    </header>
  );
}