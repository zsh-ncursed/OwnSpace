import { describe, it, expect } from 'vitest';
import { composeGradient, parseGradientValue } from '../src/ui/background-settings.js';

describe('composeGradient', () => {
  it('builds a linear gradient with the angle in degrees', () => {
    expect(composeGradient('linear', 135, '#ff0000', '#0000ff')).toBe(
      'linear-gradient(135deg, #ff0000, #0000ff)',
    );
  });

  it('builds a radial gradient (angle is not applicable)', () => {
    expect(composeGradient('radial', 90, '#ff0000', '#0000ff')).toBe(
      'radial-gradient(circle, #ff0000, #0000ff)',
    );
  });

  it('roundtrips through parseGradientValue', () => {
    const composed = composeGradient('linear', 45, '#2193b0', '#6dd5ed');
    expect(parseGradientValue(composed)).toEqual({
      type: 'linear',
      angle: 45,
      color1: '#2193b0',
      color2: '#6dd5ed',
    });
  });
});

describe('parseGradientValue', () => {
  it('parses a radial gradient back into parts', () => {
    expect(parseGradientValue('radial-gradient(circle, #ed4264, #ffedbc)')).toEqual({
      type: 'radial',
      angle: 135, // no angle in the source — falls back to the default
      color1: '#ed4264',
      color2: '#ffedbc',
    });
  });

  it('parses a legacy hand-typed gradient best effort', () => {
    // Old values could be anything CSS allows: named positions, stops, extra
    // colors. The parser must take the type + first two hex colors, not choke.
    expect(parseGradientValue('linear-gradient(to right, #fff, #000 80%)')).toEqual({
      type: 'linear',
      angle: 135,
      color1: '#fff',
      color2: '#000',
    });
  });

  it('keeps negative angles from legacy values', () => {
    expect(parseGradientValue('linear-gradient(-90deg, #fff, #000)')).toEqual({
      type: 'linear',
      angle: -90,
      color1: '#fff',
      color2: '#000',
    });
  });

  it('falls back to default colors when the value has none', () => {
    const parsed = parseGradientValue('linear-gradient(90deg, red, blue)');
    expect(parsed.color1).toMatch(/^#[0-9a-f]{6}$/i);
    expect(parsed.color2).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('returns null for non-gradient values', () => {
    expect(parseGradientValue('#1a1a2e')).toBeNull();
    expect(parseGradientValue('')).toBeNull();
    expect(parseGradientValue(null)).toBeNull();
    expect(parseGradientValue(undefined)).toBeNull();
    expect(parseGradientValue(123)).toBeNull();
  });
});
