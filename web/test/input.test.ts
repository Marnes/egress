import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInputRouter } from '../src/ui/input.js';

afterEach(() => vi.unstubAllGlobals());

describe('input router', () => {
  it('opens chat with Enter in world mode and leaves Enter to text inputs', () => {
    let keydown: ((event: KeyboardEvent) => void) | undefined;
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => (keydown = listener),
      removeEventListener: vi.fn()
    });
    const onOpenIntercom = vi.fn();
    const router = createInputRouter({ onOpenIntercom, onEscape: vi.fn() });
    const worldEnter = keyboardEvent('Enter');

    keydown!(worldEnter);
    expect(onOpenIntercom).toHaveBeenCalledOnce();
    expect(worldEnter.preventDefault).toHaveBeenCalledOnce();

    router.setMode('text');
    keydown!(keyboardEvent('Enter'));
    expect(onOpenIntercom).toHaveBeenCalledOnce();
    router.dispose();
  });

  it('routes Escape in either mode and no longer reacts to T', () => {
    let keydown: ((event: KeyboardEvent) => void) | undefined;
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => (keydown = listener),
      removeEventListener: vi.fn()
    });
    const onOpenIntercom = vi.fn();
    const onEscape = vi.fn();
    const router = createInputRouter({ onOpenIntercom, onEscape });

    keydown!(keyboardEvent('t'));
    expect(onOpenIntercom).not.toHaveBeenCalled();
    router.setMode('text');
    keydown!(keyboardEvent('Escape'));
    expect(onEscape).toHaveBeenCalledOnce();
    router.dispose();
  });
});

function keyboardEvent(key: string): KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}
