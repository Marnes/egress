import { describe, expect, it, vi } from 'vitest';
import { createWebGL2Context } from '../src/three/renderer.js';

describe('createWebGL2Context', () => {
  it('uses the preferred high-performance antialiased context when supported', () => {
    const context = {} as WebGL2RenderingContext;
    const getContext = vi.fn(() => context);
    const canvas = { getContext } as unknown as HTMLCanvasElement;

    expect(createWebGL2Context(canvas)).toBe(context);
    expect(getContext).toHaveBeenCalledOnce();
    expect(getContext).toHaveBeenCalledWith('webgl2', {
      antialias: true,
      powerPreference: 'high-performance'
    });
  });

  it('falls back to standard WebGL2 when selected attributes are unsupported', () => {
    const context = {} as WebGL2RenderingContext;
    const getContext = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(context);
    const canvas = { getContext } as unknown as HTMLCanvasElement;

    expect(createWebGL2Context(canvas)).toBe(context);
    expect(getContext).toHaveBeenNthCalledWith(1, 'webgl2', {
      antialias: true,
      powerPreference: 'high-performance'
    });
    expect(getContext).toHaveBeenNthCalledWith(2, 'webgl2', { antialias: true });
    expect(getContext).toHaveBeenNthCalledWith(3, 'webgl2');
  });
});
