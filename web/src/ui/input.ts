export type InputMode = 'world' | 'text';

export type InputRouter = {
  setMode(mode: InputMode): void;
  dispose(): void;
};

export function createInputRouter(handlers: {
  onOpenIntercom(): void;
  onEscape(): void;
}): InputRouter {
  let mode: InputMode = 'world';

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handlers.onEscape();
      return;
    }
    if (event.key !== 'Enter' || mode === 'text') return;
    event.preventDefault();
    handlers.onOpenIntercom();
  };

  window.addEventListener('keydown', onKeydown);
  return {
    setMode(nextMode) {
      mode = nextMode;
    },
    dispose() {
      window.removeEventListener('keydown', onKeydown);
    }
  };
}
