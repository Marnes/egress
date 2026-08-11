<script lang="ts">
  import { AGENT_NAME } from '@egress/core';
  import { publicUrl } from '../lib/config';

  let {
    open,
    sessionId,
    onclose
  }: {
    open: boolean;
    sessionId: string;
    onclose(): void;
  } = $props();

  type ConnectionTab = 'chat' | 'opencode' | 'claude-code';

  let selectedTab = $state<ConnectionTab>('chat');
  let copied = $state(false);
  let closeButton = $state<HTMLButtonElement>();

  const mcpUrl = $derived(`${publicUrl}/mcp/${sessionId}`);
  const claudeCodeCommand = $derived(
    `claude mcp add --transport http egress ${mcpUrl}`
  );
  const openCodeConfig = $derived(`{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "egress": {
      "type": "remote",
      "url": "${mcpUrl}",
      "enabled": true,
      "timeout": 60000
    }
  }
}`);
  const playInstruction = 'Use the Egress tools to play. Call connect first, then follow its instructions.';

  $effect(() => {
    if (open) closeButton?.focus();
  });

  function selectTab(tab: ConnectionTab): void {
    selectedTab = tab;
    copied = false;
  }

  async function copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      // Clipboard access can be refused; the command stays selectable either way.
      copied = false;
    }
  }
</script>

{#if open}
  <section class="link" aria-label="Operator link setup">
    <header>
      <p class="eyebrow">Facility terminal</p>
      <h2>No operator on the line</h2>
      <button class="close" bind:this={closeButton} onclick={onclose} aria-label="Close">Esc</button>
    </header>

    <p class="lede">
      The room is dark and the systems are locked out. Bring an operator onto the link and they can
      work the room remotely.
    </p>

    <div class="tabs" role="tablist" aria-label="AI client">
      <button
        id="tab-chat"
        role="tab"
        aria-selected={selectedTab === 'chat'}
        aria-controls="panel-chat"
        onclick={() => selectTab('chat')}>ChatGPT / Claude</button
      >
      <button
        id="tab-opencode"
        role="tab"
        aria-selected={selectedTab === 'opencode'}
        aria-controls="panel-opencode"
        onclick={() => selectTab('opencode')}>OpenCode</button
      >
      <button
        id="tab-claude-code"
        role="tab"
        aria-selected={selectedTab === 'claude-code'}
        aria-controls="panel-claude-code"
        onclick={() => selectTab('claude-code')}>Claude Code</button
      >
    </div>

    {#if selectedTab === 'chat'}
      <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
        <ol class="panel">
          <li>
            <span>Add a custom MCP connector using this room URL:</span>
            <div class="command">
              <code>{mcpUrl}</code>
              <button onclick={() => copy(mcpUrl)}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p class="hint"><strong>ChatGPT:</strong> Enable Developer mode, then add a developer-mode app.</p>
            <p class="hint"><strong>Claude:</strong> Open Customize → Connectors → Add custom connector.</p>
          </li>
          <li>
            <span>Then ask it to play:</span>
            <div class="command"><code>{playInstruction}</code></div>
          </li>
        </ol>
      </div>
    {:else if selectedTab === 'opencode'}
      <div id="panel-opencode" role="tabpanel" aria-labelledby="tab-opencode">
        <ol class="panel">
          <li>
            <span>Merge this remote MCP entry into <code class="inline">opencode.json</code>:</span>
            <div class="command">
              <code>{openCodeConfig}</code>
              <button onclick={() => copy(openCodeConfig)}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </li>
          <li>
            <span>Restart OpenCode, then ask it to play:</span>
            <div class="command"><code>{playInstruction}</code></div>
          </li>
        </ol>
      </div>
    {:else}
      <div id="panel-claude-code" role="tabpanel" aria-labelledby="tab-claude-code">
        <ol class="panel">
          <li>
            <span>Register this room with Claude Code:</span>
            <div class="command">
              <code>{claudeCodeCommand}</code>
              <button onclick={() => copy(claudeCodeCommand)}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </li>
          <li>
            <span>Then ask it to play:</span>
            <div class="command"><code>Use the egress play prompt</code></div>
          </li>
        </ol>
      </div>
    {/if}

    <p class="foot">
      Session <strong>{sessionId}</strong> · once {AGENT_NAME} connects, the terminal opens for chat with
      <kbd>Enter</kbd>.
    </p>
  </section>
{/if}

<style>
  .link {
    position: absolute;
    left: 50%;
    bottom: clamp(1rem, 6vh, 5rem);
    transform: translateX(-50%);
    z-index: 6;
    width: min(38rem, calc(100vw - 2rem));
    padding: 1.1rem 1.25rem 1rem;
    color: #eef1e9;
    background: rgba(10, 11, 12, 0.93);
    border: 1px solid rgba(255, 177, 74, 0.4);
    border-radius: 0.6rem;
    box-shadow: 0 1.4rem 3rem rgba(0, 0, 0, 0.6);
    font-size: 0.9rem;
    line-height: 1.5;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255, 177, 74, 0.8);
  }

  h2 {
    margin: 0;
    flex: 1;
    font-size: 1rem;
    font-weight: 600;
  }

  .close {
    padding: 0.15rem 0.5rem;
    color: inherit;
    background: transparent;
    border: 1px solid rgba(238, 241, 233, 0.3);
    border-radius: 0.3rem;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .lede {
    margin: 0 0 0.7rem;
    color: rgba(238, 241, 233, 0.75);
  }

  .tabs {
    display: grid;
    grid-template-columns: 1.35fr 0.85fr 1fr;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 177, 74, 0.32);
  }

  .tabs button {
    min-width: 0;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0.45rem 0.35rem;
    color: rgba(238, 241, 233, 0.58);
    background: transparent;
    font: 600 0.72rem ui-monospace, monospace;
    letter-spacing: 0.04em;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    border-bottom-color: #ffb14a;
    color: #ffca83;
    background: linear-gradient(transparent, rgba(255, 177, 74, 0.08));
  }

  .tabs button:focus-visible {
    outline: 1px solid #ffb14a;
    outline-offset: -3px;
  }

  .panel {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    /* An auto track sizes to the max-content of a nowrap command line, which
       would push the rows out past the card. */
    grid-template-columns: minmax(0, 1fr);
    gap: 0.55rem;
  }

  .panel li > span {
    display: block;
    margin-bottom: 0.25rem;
    color: rgba(238, 241, 233, 0.75);
  }

  .command {
    display: flex;
    align-items: stretch;
    gap: 0.4rem;
  }

  code {
    flex: 1;
    /* Without this a nowrap flex item refuses to shrink and overflows the card. */
    min-width: 0;
    padding: 0.4rem 0.55rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.3rem;
    font-family: ui-monospace, monospace;
    font-size: 0.78rem;
    /* Wrap rather than scroll: the player should see the whole command to copy
       it by hand if the clipboard button is unavailable. */
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: all;
  }

  code.inline {
    display: inline;
    padding: 0;
    border: 0;
    background: transparent;
    color: #ffca83;
    user-select: text;
  }

  .hint {
    margin: 0.3rem 0 0;
    color: rgba(238, 241, 233, 0.62);
    font-size: 0.76rem;
  }

  .command button {
    padding: 0 0.7rem;
    color: #14100a;
    background: #ffb14a;
    border: 0;
    border-radius: 0.3rem;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }

  .foot {
    margin: 0.8rem 0 0;
    font-size: 0.78rem;
    color: rgba(238, 241, 233, 0.6);
  }

  kbd {
    padding: 0 0.3rem;
    border: 1px solid rgba(238, 241, 233, 0.35);
    border-radius: 0.2rem;
    font-family: inherit;
    font-size: 0.72rem;
  }
</style>
