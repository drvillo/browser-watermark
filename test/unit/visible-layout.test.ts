import { describe, it, expect } from 'vitest';
import {
  computeLayoutConfig,
  computeTextPosition,
  VISIBLE_DEFAULTS,
} from '../../src/visible/layout';

describe('computeLayoutConfig', () => {
  it('should compute layout with default values', () => {
    const config = computeLayoutConfig(1000, 800);

    expect(config.maxWidth).toBe(350); // 35% of 1000
    expect(config.maxHeight).toBe(64); // 8% of 800
    expect(config.minFontSize).toBe(10);
    expect(config.maxFontSize).toBe(36);
    expect(config.fontFamily).toBe('sans-serif');
    expect(config.fontWeight).toBe('600');
    expect(config.lineLimit).toBe(1);
    expect(config.opacity).toBe(0.15);
    expect(config.position).toBe('bottom-right');
  });

  it('should apply custom ratios', () => {
    const config = computeLayoutConfig(1000, 800, {
      maxWidthRatio: 0.5,
      maxHeightRatio: 0.1,
    });

    expect(config.maxWidth).toBe(500); // 50% of 1000
    expect(config.maxHeight).toBe(80); // 10% of 800
  });

  it('should clamp margins to min/max bounds', () => {
    // Very small image - margin should clamp to minimum
    const smallConfig = computeLayoutConfig(100, 100);
    expect(smallConfig.marginX).toBe(VISIBLE_DEFAULTS.minMargin);
    expect(smallConfig.marginY).toBe(VISIBLE_DEFAULTS.minMargin);

    // Very large image - margin should clamp to maximum
    const largeConfig = computeLayoutConfig(5000, 5000);
    expect(largeConfig.marginX).toBe(VISIBLE_DEFAULTS.maxMargin);
    expect(largeConfig.marginY).toBe(VISIBLE_DEFAULTS.maxMargin);
  });

  it('should accept custom font settings', () => {
    const config = computeLayoutConfig(1000, 800, {
      minFontSize: 12,
      maxFontSize: 48,
      fontFamily: 'Arial',
      fontWeight: 'bold',
    });

    expect(config.minFontSize).toBe(12);
    expect(config.maxFontSize).toBe(48);
    expect(config.fontFamily).toBe('Arial');
    expect(config.fontWeight).toBe('bold');
  });

  it('should accept custom line limit', () => {
    const config = computeLayoutConfig(1000, 800, {
      lineLimit: 2,
    });

    expect(config.lineLimit).toBe(2);
  });

  it('should accept custom opacity', () => {
    const config = computeLayoutConfig(1000, 800, {
      opacity: 0.5,
    });

    expect(config.opacity).toBe(0.5);
  });
});

describe('computeTextPosition', () => {
  const baseConfig = computeLayoutConfig(1000, 800);

  it('should position bottom-right correctly', () => {
    const config = { ...baseConfig, position: 'bottom-right' as const };
    const pos = computeTextPosition(1000, 800, config);

    expect(pos.x).toBe(1000 - config.marginX);
    expect(pos.y).toBe(800 - config.marginY);
    expect(pos.textAlign).toBe('right');
    expect(pos.textBaseline).toBe('bottom');
  });

  it('should position bottom-left correctly', () => {
    const config = { ...baseConfig, position: 'bottom-left' as const };
    const pos = computeTextPosition(1000, 800, config);

    expect(pos.x).toBe(config.marginX);
    expect(pos.y).toBe(800 - config.marginY);
    expect(pos.textAlign).toBe('left');
    expect(pos.textBaseline).toBe('bottom');
  });

  it('should position top-right correctly', () => {
    const config = { ...baseConfig, position: 'top-right' as const };
    const pos = computeTextPosition(1000, 800, config);

    expect(pos.x).toBe(1000 - config.marginX);
    expect(pos.y).toBe(config.marginY);
    expect(pos.textAlign).toBe('right');
    expect(pos.textBaseline).toBe('top');
  });

  it('should position top-left correctly', () => {
    const config = { ...baseConfig, position: 'top-left' as const };
    const pos = computeTextPosition(1000, 800, config);

    expect(pos.x).toBe(config.marginX);
    expect(pos.y).toBe(config.marginY);
    expect(pos.textAlign).toBe('left');
    expect(pos.textBaseline).toBe('top');
  });

  it('should position bottom-center correctly', () => {
    const config = { ...baseConfig, position: 'bottom-center' as const };
    const pos = computeTextPosition(1000, 800, config);

    expect(pos.x).toBe(500); // center
    expect(pos.y).toBe(800 - config.marginY);
    expect(pos.textAlign).toBe('center');
    expect(pos.textBaseline).toBe('bottom');
  });
});
