import type { VisibleWatermarkPosition } from '../types';

/**
 * Resolved configuration for visible watermark layout.
 */
export type LayoutConfig = {
  maxWidth: number;
  maxHeight: number;
  marginX: number;
  marginY: number;
  minFontSize: number;
  maxFontSize: number;
  fontFamily: string;
  fontWeight: string;
  lineLimit: 1 | 2;
  opacity: number;
  position: VisibleWatermarkPosition;
};

/**
 * Default values for visible watermark configuration.
 */
export const VISIBLE_DEFAULTS = {
  position: 'bottom-right' as VisibleWatermarkPosition,
  opacity: 0.15,
  maxWidthRatio: 0.35,
  maxHeightRatio: 0.08,
  marginRatio: 0.03,
  minFontSize: 10,
  maxFontSize: 36,
  fontFamily: 'sans-serif',
  fontWeight: '600',
  lineLimit: 1 as const,
  // Pixel clamps for margins
  minMargin: 8,
  maxMargin: 48,
} as const;

/**
 * Compute layout configuration from image dimensions and options.
 */
export function computeLayoutConfig(
  imageWidth: number,
  imageHeight: number,
  options: {
    position?: VisibleWatermarkPosition;
    opacity?: number;
    maxWidthRatio?: number;
    maxHeightRatio?: number;
    marginRatio?: number;
    minFontSize?: number;
    maxFontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    lineLimit?: 1 | 2;
  } = {}
): LayoutConfig {
  const maxWidthRatio = options.maxWidthRatio ?? VISIBLE_DEFAULTS.maxWidthRatio;
  const maxHeightRatio = options.maxHeightRatio ?? VISIBLE_DEFAULTS.maxHeightRatio;
  const marginRatio = options.marginRatio ?? VISIBLE_DEFAULTS.marginRatio;

  const maxWidth = Math.floor(imageWidth * maxWidthRatio);
  const maxHeight = Math.floor(imageHeight * maxHeightRatio);

  // Compute margin with pixel clamps
  const rawMarginX = Math.floor(imageWidth * marginRatio);
  const rawMarginY = Math.floor(imageHeight * marginRatio);
  const marginX = Math.max(VISIBLE_DEFAULTS.minMargin, Math.min(rawMarginX, VISIBLE_DEFAULTS.maxMargin));
  const marginY = Math.max(VISIBLE_DEFAULTS.minMargin, Math.min(rawMarginY, VISIBLE_DEFAULTS.maxMargin));

  return {
    maxWidth,
    maxHeight,
    marginX,
    marginY,
    minFontSize: options.minFontSize ?? VISIBLE_DEFAULTS.minFontSize,
    maxFontSize: options.maxFontSize ?? VISIBLE_DEFAULTS.maxFontSize,
    fontFamily: options.fontFamily ?? VISIBLE_DEFAULTS.fontFamily,
    fontWeight: options.fontWeight ?? VISIBLE_DEFAULTS.fontWeight,
    lineLimit: options.lineLimit ?? VISIBLE_DEFAULTS.lineLimit,
    opacity: options.opacity ?? VISIBLE_DEFAULTS.opacity,
    position: options.position ?? VISIBLE_DEFAULTS.position,
  };
}

/**
 * Coordinate-system-agnostic position anchor.
 */
export type PositionAnchor = {
  xAnchor: 'left' | 'center' | 'right';
  yAnchor: 'top' | 'bottom';
  xOffset: number;
  yOffset: number;
};

/**
 * Result of text positioning calculation.
 */
export type TextPosition = {
  x: number;
  y: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

/**
 * Calculate coordinate-system-agnostic position anchor.
 * Can be converted to canvas or PDF coordinates.
 */
export function computePositionAnchor(
  _width: number,
  _height: number,
  config: LayoutConfig
): PositionAnchor {
  const { marginX, marginY, position } = config;
  switch (position) {
    case 'top-left':
      return { xAnchor: 'left', yAnchor: 'top', xOffset: marginX, yOffset: marginY };
    case 'top-right':
      return { xAnchor: 'right', yAnchor: 'top', xOffset: marginX, yOffset: marginY };
    case 'bottom-left':
      return { xAnchor: 'left', yAnchor: 'bottom', xOffset: marginX, yOffset: marginY };
    case 'bottom-center':
      return { xAnchor: 'center', yAnchor: 'bottom', xOffset: 0, yOffset: marginY };
    case 'bottom-right':
    default:
      return { xAnchor: 'right', yAnchor: 'bottom', xOffset: marginX, yOffset: marginY };
  }
}

/**
 * Calculate the anchor position for text based on the selected position.
 */
export function computeTextPosition(
  imageWidth: number,
  imageHeight: number,
  config: LayoutConfig
): TextPosition {
  const { marginX, marginY, position } = config;

  switch (position) {
    case 'top-left':
      return {
        x: marginX,
        y: marginY,
        textAlign: 'left',
        textBaseline: 'top',
      };
    case 'top-right':
      return {
        x: imageWidth - marginX,
        y: marginY,
        textAlign: 'right',
        textBaseline: 'top',
      };
    case 'bottom-left':
      return {
        x: marginX,
        y: imageHeight - marginY,
        textAlign: 'left',
        textBaseline: 'bottom',
      };
    case 'bottom-center':
      return {
        x: imageWidth / 2,
        y: imageHeight - marginY,
        textAlign: 'center',
        textBaseline: 'bottom',
      };
    case 'bottom-right':
    default:
      return {
        x: imageWidth - marginX,
        y: imageHeight - marginY,
        textAlign: 'right',
        textBaseline: 'bottom',
      };
  }
}
