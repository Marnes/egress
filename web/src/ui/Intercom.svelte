<script lang="ts">
  import { AGENT_NAME } from '@egress/core';
  import type { IntercomLine } from '@egress/core';

  let {
    available,
    open,
    unreadCount,
    lines,
    onopen,
    onclose,
    onsend,
    onselect
  }: {
    /** The link is up; before that there is nothing to talk to. */
    available: boolean;
    open: boolean;
    unreadCount: number;
    lines: IntercomLine[];
    onopen(): void;
    onclose(): void;
    onsend(text: string): void | Promise<void>;
    onselect(choiceId: string, optionId: string): void | Promise<void>;
  } = $props();

  let message = $state('');
  let input = $state<HTMLTextAreaElement>();
  let history = $state.raw<HTMLOListElement>();
  let submittingChoice = $state<string>();

  const MAX_INPUT_HEIGHT = 77;
  const latestAgentMessage = $derived.by(() => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].from === 'agent') return lines[index].text;
    }
    return '';
  });
  const pendingChoice = $derived.by(() => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const choice = lines[index].choice;
      if (choice?.selectedOptionId === null) return choice;
    }
    return undefined;
  });

  $effect(() => {
    if (open) input?.focus();
  });
  $effect(() => {
    const hasLines = lines.length > 0;
    requestAnimationFrame(() => {
      if (hasLines && history) history.scrollTop = history.scrollHeight;
    });
  });

  function resizeInput(target: HTMLTextAreaElement): void {
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    target.style.overflowY = target.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
  }

  async function submit(): Promise<void> {
    if (pendingChoice) return;
    const text = message.trim();
    if (!text) return;
    message = '';
    requestAnimationFrame(() => {
      if (input) resizeInput(input);
    });
    await onsend(text);
  }

  async function select(choiceId: string, optionId: string): Promise<void> {
    if (submittingChoice) return;
    submittingChoice = choiceId;
    try {
      await onselect(choiceId, optionId);
    } finally {
      submittingChoice = undefined;
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void submit();
  }
</script>

{#if available}
  <button class="affordance" class:open onclick={open ? onclose : onopen} aria-label="Toggle facility terminal">
    <span aria-hidden="true">{open ? 'CLOSE' : 'CHAT'}</span>
    <kbd>{open ? 'ESC' : 'ENTER'}</kbd>
    {#if unreadCount > 0}<i aria-label={`${unreadCount} unread messages`}></i>{/if}
  </button>
{/if}

{#if available && !open && unreadCount > 0 && latestAgentMessage}
  <button class="notification" onclick={onopen} aria-label={`Open ${unreadCount} unread messages from ${AGENT_NAME}`} aria-live="polite">
    <span class="notification-meta">
      <strong>{AGENT_NAME} // INCOMING</strong>
      <small>{unreadCount} {unreadCount === 1 ? 'message' : 'messages'}</small>
    </span>
    <span class="notification-text">{latestAgentMessage}</span>
    <span class="notification-action">Open chat <kbd>ENTER</kbd></span>
  </button>
{/if}

{#if open}
  <section class="intercom" aria-label="Facility terminal">
    <header>
      <div><span class="signal"></span> Kestrel facility terminal &middot; {AGENT_NAME}</div>
      <button onclick={onclose} aria-label="Close terminal">Close <kbd>ESC</kbd></button>
    </header>
    <ol bind:this={history}>
      {#each lines as line, index (index)}
        <li class={line.from}>
          <strong>{line.from === 'agent' ? AGENT_NAME : 'YOU'}</strong>
          <div class="message-body">
            <span class="message-text">{line.text}</span>
            {#if line.choice}
              <div class="choices" aria-label="Response options">
                {#each line.choice.options as option (option.id)}
                  <button
                    type="button"
                    class:selected={line.choice.selectedOptionId === option.id}
                    disabled={line.choice.selectedOptionId !== null || submittingChoice === line.choice.id}
                    onclick={() => void select(line.choice!.id, option.id)}
                  >{option.label}</button>
                {/each}
              </div>
            {/if}
          </div>
        </li>
      {/each}
      {#if lines.length === 0}<li class="empty">Link open. Waiting for {AGENT_NAME}.</li>{/if}
    </ol>
    <form onsubmit={(event) => { event.preventDefault(); void submit(); }}>
      <span>&gt;</span>
      <textarea
        bind:this={input}
        bind:value={message}
        rows="1"
        autocomplete="off"
        disabled={pendingChoice !== undefined}
        placeholder={pendingChoice ? 'Select an option above' : 'Enter to send · Shift+Enter for newline'}
        onkeydown={keydown}
        oninput={(event) => resizeInput(event.currentTarget)}
      ></textarea>
      <button type="submit" disabled={pendingChoice !== undefined}>Send</button>
    </form>
  </section>
{/if}

<style>
  .affordance {
    position: absolute;
    right: clamp(0.75rem, 2vw, 1.5rem);
    bottom: clamp(0.75rem, 2vw, 1.5rem);
    z-index: 7;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid #79847e;
    padding: 0.45rem 0.55rem;
    color: #e8ece5;
    background: rgb(12 16 17 / 84%);
    box-shadow: none;
    font: 800 0.72rem ui-monospace, monospace;
    letter-spacing: 0.12em;
    cursor: pointer;
  }
  .affordance.open { bottom: calc(33vh + 0.75rem); }
  kbd {
    border: 1px solid #8e9992;
    padding: 0.08rem 0.27rem;
    color: #c6a05e;
    background: #171d1d;
    font: inherit;
  }
  .affordance i {
    width: 0.48rem;
    height: 0.48rem;
    border-radius: 50%;
    background: #e7ae4a;
    box-shadow: 0 0 0.5rem #e7ae4a;
  }
  .notification {
    position: absolute;
    right: clamp(0.75rem, 2vw, 1.5rem);
    bottom: 4rem;
    z-index: 7;
    display: grid;
    width: min(23rem, calc(100vw - 1.5rem));
    border: 1px solid #638b70;
    border-left: 3px solid #84b794;
    padding: 0.7rem 0.8rem;
    color: #dce2da;
    background: linear-gradient(110deg, rgb(8 13 13 / 96%), rgb(20 30 27 / 94%));
    box-shadow: 0 0.8rem 2rem #0008, 0 0 1.5rem rgb(121 184 139 / 12%);
    font-family: ui-monospace, "SFMono-Regular", monospace;
    text-align: left;
    cursor: pointer;
  }
  .notification-meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: #84b794;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .notification-meta small { color: #89958e; font: inherit; letter-spacing: 0.04em; }
  .notification-text {
    display: -webkit-box;
    margin-top: 0.45rem;
    overflow: hidden;
    font-size: 0.82rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .notification-action {
    margin-top: 0.55rem;
    color: #aeb9b1;
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .notification-action kbd { margin-left: 0.25rem; }
  .intercom {
    position: absolute;
    inset: auto 0 0;
    z-index: 6;
    height: 33vh;
    min-height: 13rem;
    box-sizing: border-box;
    border-top: 2px solid #c6a05e;
    padding: 0.75rem clamp(0.75rem, 3vw, 2rem);
    color: #dce2da;
    background: linear-gradient(90deg, rgb(9 13 14 / 96%), rgb(18 25 25 / 91%));
    font-family: ui-monospace, "SFMono-Regular", monospace;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    color: #b9c2ba;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  header button {
    border: 0;
    color: inherit;
    background: none;
    cursor: pointer;
  }
  .signal {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.35rem;
    border-radius: 50%;
    border: 0;
    background: #79b88b;
  }
  ol {
    min-height: 0;
    margin: 0.55rem 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 5.4rem 1fr;
    gap: 0.5rem;
    padding: 0.2rem 0;
    font-size: clamp(0.75rem, 1.8vw, 0.9rem);
  }
  li strong { color: #c6a05e; font-size: 0.72rem; letter-spacing: 0.08em; }
  li.agent strong { color: #84b794; }
  .message-body { min-width: 0; }
  .message-text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .choices { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
  .choices button {
    border: 1px solid #718078;
    border-radius: 0.25rem;
    padding: 0.38rem 0.7rem;
    color: #e8ece5;
    background: #26302d;
    font: 700 0.72rem ui-monospace, monospace;
    cursor: pointer;
  }
  .choices button:hover:not(:disabled), .choices button:focus-visible { border-color: #c6a05e; color: #ffca83; }
  .choices button:disabled { cursor: default; opacity: 0.45; }
  .choices button.selected { border-color: #84b794; color: #b9e2c4; opacity: 1; }
  li.empty { display: block; color: #6e7c7e; font-style: italic; }
  form {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
    border-top: 1px solid #56605b;
    padding-top: 0.55rem;
  }
  textarea {
    min-width: 0;
    max-height: 4.8rem;
    border: 0;
    outline: 0;
    padding: 0;
    overflow-y: hidden;
    resize: none;
    color: #f3f5ef;
    background: transparent;
    font: 0.9rem ui-monospace, monospace;
    line-height: 1.35;
  }
  textarea:disabled { color: #89958e; cursor: not-allowed; }
  form button {
    border: 1px solid #738078;
    border-radius: 0.3rem;
    padding: 0.3rem 0.65rem;
    color: #e8ece5;
    background: #26302d;
    box-shadow: none;
    cursor: pointer;
  }
  form button:disabled { cursor: not-allowed; opacity: 0.45; }
</style>
