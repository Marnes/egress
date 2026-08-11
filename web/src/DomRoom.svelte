<script lang="ts">
  import type { PlayerView } from '@egress/core';

  let {
    view,
    roomLog,
    onaction
  }: {
    view: PlayerView;
    roomLog: { text: string }[];
    onaction(objectId: string, actionId: string, digits?: string): void | Promise<void>;
  } = $props();

  let codeDigits = $state<Record<string, string>>({});

  function switchIndex(objectId: string): number | null {
    const match = objectId.match(/^switch_(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  async function submitCode(objectId: string, actionId: string): Promise<void> {
    await onaction(objectId, actionId, codeDigits[objectId] ?? '');
    codeDigits[objectId] = '';
  }
</script>

<main>
  <section>
    <h2>Room objects</h2>
    <ul class="objects">
      {#each view.objects as object (object.id)}
        <li>
          <div>
            <strong>{object.label}</strong>
            {#if object.stencil}<span>stencil {object.stencil}</span>{/if}
            {#if object.gauge !== null}<span>reads {object.gauge}</span>{/if}
            {#if switchIndex(object.id) !== null}
              <span>{view.switches[switchIndex(object.id)!] ? 'up' : 'down'}</span>
            {/if}
          </div>
          <div class="actions">
            {#each object.actions as action (action.id)}
              {#if action.input === 'digits4'}
                <input inputmode="numeric" maxlength="4" placeholder="0000" disabled={!action.enabled} bind:value={codeDigits[object.id]} />
                <button disabled={!action.enabled} onclick={() => submitCode(object.id, action.id)}>{action.label}</button>
              {:else}
                <button disabled={!action.enabled} onclick={() => onaction(object.id, action.id)}>{action.label}</button>
              {/if}
            {/each}
          </div>
        </li>
      {/each}
    </ul>
  </section>
  <section>
    <h2>Room log</h2>
    <ul class="log">{#each roomLog as line, index (index)}<li>{line.text}</li>{/each}</ul>
  </section>
</main>

<style>
  main { max-width: 52rem; margin: 8rem auto 7rem; padding: 1rem; color: #202526; font-family: system-ui, sans-serif; }
  section { margin-bottom: 1rem; border: 1px solid #bdc4c1; padding: 1rem; background: #f4f5f1; }
  h2 { margin-top: 0; }
  ul { margin: 0; padding: 0; list-style: none; }
  .objects li { display: flex; justify-content: space-between; gap: 1rem; border-top: 1px solid #d5d9d6; padding: 0.65rem 0; }
  .objects li:first-child { border: 0; }
  .objects li div { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; }
  .objects span { color: #596360; font-size: 0.82rem; }
  .actions { justify-content: flex-end; }
  input { width: 4.5rem; }
  button, input { padding: 0.35rem 0.5rem; }
  .log li { padding: 0.2rem 0; color: #4c5552; font-style: italic; }
  @media (max-width: 42rem) { .objects li { flex-direction: column; } .actions { justify-content: flex-start; } }
</style>
