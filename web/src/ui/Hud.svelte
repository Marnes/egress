<script lang="ts">
  import { AGENT_NAME } from '@egress/core';
  import type { IntercomLine, PlayerView } from '@egress/core';

  let {
    view,
    agentConnected,
    roomLog,
    intercomLog,
    error,
    onrestart
  }: {
    view: PlayerView;
    agentConnected: boolean;
    roomLog: { text: string }[];
    intercomLog: IntercomLine[];
    error: string | null;
    onrestart(): void | Promise<void>;
  } = $props();

  let menu: HTMLDetailsElement;
  let intercomFeed = $state.raw<HTMLElement>();

  $effect(() => {
    const hasMessages = intercomLog.length > 0;
    requestAnimationFrame(() => {
      if (hasMessages && intercomFeed) intercomFeed.scrollTop = intercomFeed.scrollHeight;
    });
  });

  async function restart(): Promise<void> {
    const confirmed = window.confirm(
      'Restart this room from the beginning? Your current progress and messages will be cleared.'
    );
    if (!confirmed) return;
    menu.open = false;
    await onrestart();
  }
</script>

<aside class="hud" aria-label="Room status">
  <div class="title-row">
    <div>
      <p class="eyebrow">Egress control</p>
      <h1>{view.roomName}</h1>
    </div>
    <div class="actions">
      <span class="status" class:connected={agentConnected}>
        {agentConnected ? 'Agent online' : 'Awaiting agent'}
      </span>
      <details class="menu" bind:this={menu}>
        <summary aria-label="Game menu">Menu</summary>
        <div class="menu-panel">
          <button onclick={() => void restart()}>Restart from start</button>
        </div>
      </details>
    </div>
  </div>
  {#if roomLog.length > 0}
    <ol class="room-log" aria-label="Room events" aria-live="polite">
      {#each roomLog.slice(-3) as line, index (index)}
        <li>{line.text}</li>
      {/each}
    </ol>
  {/if}
  {#if intercomLog.length > 0}
    <section
      class="intercom-feed"
      bind:this={intercomFeed}
      aria-label="Recent intercom messages"
      aria-live="polite"
    >
      <p>Intercom // live</p>
      <ol>
        {#each intercomLog.slice(-6) as line, index (index)}
          <li class={line.from}>
            <strong>{line.from === 'agent' ? AGENT_NAME : 'YOU'}</strong>
            <span>{line.text}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
  {#if view.complete}
    <p class="complete">Exit open. Evacuation route clear.</p>
  {/if}
  {#if error}
    <p class="error">{error}</p>
  {/if}
  <p class="controls">WASD move | Drag to look | Click nearby props | Enter opens chat | Esc closes</p>
</aside>

<style>
  .hud {
    position: absolute;
    top: clamp(0.75rem, 2vw, 1.5rem);
    left: clamp(0.75rem, 2vw, 1.5rem);
    z-index: 4;
    width: min(27rem, calc(100vw - 1.5rem));
    color: #eef1e9;
    font-family: "Arial Narrow", "Roboto Condensed", sans-serif;
    text-shadow: 0 1px 2px #080a0b;
  }
  .title-row {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    border: 0;
    padding: 0;
    background: none;
    box-shadow: none;
  }
  .actions {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
  }
  .eyebrow {
    margin: 0 0 0.12rem;
    color: #c6a05e;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.35rem, 3vw, 2.2rem);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .status {
    border: 1px solid #8f554d;
    padding: 0.3rem 0.45rem;
    color: #e2aaa0;
    background: rgb(12 16 17 / 72%);
    font: 700 0.66rem ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .status.connected {
    border-color: #638b70;
    color: #a9dab7;
    background: rgb(12 16 17 / 72%);
  }
  .menu {
    position: relative;
    font: 0.68rem ui-monospace, monospace;
  }
  .menu summary {
    border: 1px solid #68736d;
    padding: 0.28rem 0.45rem;
    color: #dce1da;
    background: rgb(8 11 12 / 82%);
    cursor: pointer;
    list-style: none;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .menu summary::-webkit-details-marker { display: none; }
  .menu-panel {
    position: absolute;
    top: calc(100% + 0.3rem);
    right: 0;
    width: 10.5rem;
    border: 1px solid #68736d;
    padding: 0.3rem;
    background: rgb(8 11 12 / 96%);
    box-shadow: 0 0.8rem 2rem #0009;
  }
  .menu-panel button {
    width: 100%;
    border: 0;
    padding: 0.45rem 0.5rem;
    color: #ffca83;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .menu-panel button:hover, .menu-panel button:focus-visible { background: rgb(255 177 74 / 12%); }
  .room-log {
    position: fixed;
    left: clamp(0.75rem, 2vw, 1.5rem);
    bottom: clamp(0.75rem, 2vw, 1.5rem);
    width: min(28rem, calc(100vw - 1.5rem));
    max-width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .room-log li {
    border-left: 2px solid #c6a05e;
    margin-top: 0.25rem;
    padding: 0.25rem 0.55rem;
    color: #eef1e9;
    background: rgb(8 11 12 / 70%);
    font-size: 0.78rem;
  }
  .intercom-feed {
    position: fixed;
    top: clamp(0.75rem, 2vw, 1.5rem);
    right: clamp(0.75rem, 2vw, 1.5rem);
    width: min(25rem, calc(100vw - 1.5rem));
    max-height: min(48vh, 24rem);
    overflow-y: auto;
    border-top: 1px solid #638b70;
    color: #dce2da;
    background: linear-gradient(90deg, rgb(9 13 14 / 88%), rgb(18 25 25 / 78%));
    box-shadow: 0 0.8rem 2rem #0007;
    font-family: ui-monospace, "SFMono-Regular", monospace;
  }
  .intercom-feed > p {
    margin: 0;
    border-bottom: 1px solid rgb(99 139 112 / 45%);
    padding: 0.35rem 0.55rem;
    color: #a9dab7;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .intercom-feed ol { margin: 0; padding: 0.3rem 0.55rem 0.45rem; list-style: none; }
  .intercom-feed li {
    display: grid;
    grid-template-columns: 4.8rem minmax(0, 1fr);
    gap: 0.45rem;
    padding: 0.2rem 0;
    font-size: 0.76rem;
    line-height: 1.35;
  }
  .intercom-feed strong {
    color: #c6a05e;
    font-size: 0.65rem;
    letter-spacing: 0.07em;
  }
  .intercom-feed li.agent strong { color: #84b794; }
  .intercom-feed span { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .complete, .error {
    width: fit-content;
    margin: 0.65rem 0 0;
    padding: 0.45rem 0.65rem;
    background: #2f7044;
    font-weight: 800;
  }
  .error { color: #fff; background: #833e37; }
  .controls {
    width: fit-content;
    margin: 0.65rem 0 0;
    padding: 0.3rem 0.45rem;
    color: #cbd1c9;
    background: rgb(8 11 12 / 68%);
    font: 0.67rem ui-monospace, monospace;
  }
  @media (max-width: 54rem) {
    .intercom-feed { top: 8.5rem; max-height: min(38vh, 18rem); }
  }
</style>
