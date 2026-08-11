import { describe, expect, it } from 'vitest';
import { raisedTextGeometry, raisedTextWidth } from '../src/three/text/raisedText.js';

const type = { capHeight: 0.1, depth: 0.04 };

describe('raised text', () => {
  it('draws nothing when there is nothing to draw', () => {
    expect(raisedTextGeometry('', type)).toBeUndefined();
    expect(raisedTextGeometry('   ', type)).toBeUndefined();
  });

  it('centres the string on the origin and extrudes to the requested depth', () => {
    const geometry = raisedTextGeometry('BREAKERS', type)!;
    const box = geometry.boundingBox!;
    const width = raisedTextWidth('BREAKERS', type);

    expect(box.getCenter(box.min.clone()).length()).toBeLessThan(type.capHeight * 0.3);
    expect(box.max.z - box.min.z).toBeCloseTo(type.depth, 6);
    // Cap height plus half a stroke of overhang at each end.
    expect(box.max.y - box.min.y).toBeGreaterThan(type.capHeight);
    expect(box.max.y - box.min.y).toBeLessThan(type.capHeight * 1.35);
    // The reported width is a true bound on the ink, not just the advance.
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(width);
    expect(box.max.x - box.min.x).toBeGreaterThan(width * 0.9);
  });

  it('advances by glyph, so narrow letters do not leave gaps', () => {
    expect(raisedTextWidth('II', type)).toBeGreaterThan(raisedTextWidth('I', type));
    expect(raisedTextWidth('I', type)).toBeLessThan(raisedTextWidth('M', type));
    expect(raisedTextWidth('A B', type)).toBeGreaterThan(raisedTextWidth('AB', type));
  });

  it('skips characters it has no glyph for without throwing', () => {
    expect(() => raisedTextGeometry('A@B', type)).not.toThrow();
    expect(raisedTextWidth('A@B', type)).toBeGreaterThan(raisedTextWidth('AB', type));
  });

  it('scales with cap height', () => {
    const small = raisedTextWidth('BREAKERS', { capHeight: 0.05, depth: 0.01 });
    const large = raisedTextWidth('BREAKERS', { capHeight: 0.1, depth: 0.01 });
    expect(large).toBeCloseTo(small * 2, 6);
  });
});
