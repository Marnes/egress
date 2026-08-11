<script lang="ts">
  import type { IntercomLine, KeypadStatus, PlayerView, RoomVisual, Theme } from '@egress/core';
  import { onMount } from 'svelte';
  import DomRoom from './DomRoom.svelte';
  import {
    ApiError,
    createSession,
    fetchSession,
    restartSession,
    sendAction,
    sendChoice,
    sendSay,
    type ApiSession
  } from './lib/api';
  import { connectEvents } from './lib/sse';
  import Scene, { type SceneControls } from './three/Scene.svelte';
  import Hud from './ui/Hud.svelte';
  import Intercom from './ui/Intercom.svelte';
  import LinkSetup from './ui/LinkSetup.svelte';
  import { createInputRouter, type InputMode, type InputRouter } from './ui/input';

  type RoomLine = { text: string };
  const STORAGE_KEY = 'egress-session-id';
  const params = new URLSearchParams(window.location.search);
  const domMode = params.get('ui') === 'dom';
  const themeOverride = params.get('theme') ?? undefined;

  let sessionId = $state<string | null>(null);
  let view = $state<PlayerView | null>(null);
  let visual = $state.raw<RoomVisual | null>(null);
  let theme = $state.raw<Theme | null>(null);
  let agentConnected = $state(false);
  let roomLog = $state<RoomLine[]>([]);
  let intercomLog = $state<IntercomLine[]>([]);
  let intercomOpen = $state(false);
  let linkSetupOpen = $state(false);
  let unreadCount = $state(0);
  let error = $state<string | null>(null);
  let sceneControls = $state.raw<SceneControls | null>(null);
  let inputRouter = $state.raw<InputRouter | null>(null);
  const inputMode = $derived<InputMode>(intercomOpen || linkSetupOpen ? 'text' : 'world');

  $effect(() => inputRouter?.setMode(inputMode));

  onMount(() => {
    let active = true;
    let closeEvents: (() => void) | undefined;
    inputRouter = createInputRouter({
      onOpenIntercom: () => {
        if (!agentConnected) return;
        openIntercom();
      },
      onEscape: escape
    });

    const init = async (): Promise<void> => {
      const stored = localStorage.getItem(STORAGE_KEY);
      let session: ApiSession;
      try {
        session = stored
          ? await fetchSession(stored, themeOverride)
          : await createSession(themeOverride);
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        session = await createSession(themeOverride);
      }
      if (!active) return;
      sessionId = session.sessionId;
      view = session.view;
      agentConnected = session.agentConnected;
      visual = session.visual;
      theme = session.theme;
      roomLog = session.roomLog;
      intercomLog = session.intercomLog;
      localStorage.setItem(STORAGE_KEY, session.sessionId);
      closeEvents = connectEvents(session.sessionId, {
        onSync: (snapshot) => {
          view = snapshot.view;
          agentConnected = snapshot.agentConnected;
          roomLog = snapshot.roomLog;
          intercomLog = snapshot.intercomLog;
          if (snapshot.agentConnected) linkSetupOpen = false;
        },
        onState: (nextView) => (view = nextView),
        onRoom: (text) => (roomLog = [...roomLog, { text }]),
        onIntercom: (line) => {
          intercomLog = [...intercomLog, line];
          if (line.from === 'agent' && !intercomOpen) unreadCount += 1;
        },
        onAgent: (connected) => {
          agentConnected = connected;
          if (connected) linkSetupOpen = false;
        }
      });
    };

    void init().catch(() => (error = 'Could not connect to the room server.'));
    return () => {
      active = false;
      closeEvents?.();
      inputRouter?.dispose();
      inputRouter = null;
    };
  });

  async function act(objectId: string, actionId: string, digits?: string): Promise<void> {
    if (!sessionId) return;
    error = null;
    try {
      const result = await sendAction(sessionId, objectId, actionId, digits);
      view = result.view;
    } catch {
      error = 'Action failed.';
    }
  }

  async function enterKeypad(objectId: string, actionId: string, digits: string): Promise<KeypadStatus> {
    if (!sessionId) throw new Error('No active session.');
    error = null;
    try {
      const result = await sendAction(sessionId, objectId, actionId, digits);
      view = result.view;
      if (result.outcome?.kind !== 'keypad') throw new Error('Missing keypad result.');
      return result.outcome.status;
    } catch (cause) {
      error = 'Keypad transmission failed.';
      throw cause;
    }
  }

  async function say(text: string): Promise<void> {
    if (!sessionId) return;
    try {
      await sendSay(sessionId, text);
    } catch {
      error = 'Transmission failed.';
    }
  }

  async function choose(choiceId: string, optionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await sendChoice(sessionId, choiceId, optionId);
    } catch {
      error = 'Choice transmission failed.';
    }
  }

  async function restart(): Promise<void> {
    if (!sessionId) return;
    error = null;
    try {
      const session = await restartSession(sessionId, themeOverride);
      view = session.view;
      agentConnected = session.agentConnected;
      visual = session.visual;
      theme = session.theme;
      roomLog = session.roomLog;
      intercomLog = session.intercomLog;
      unreadCount = 0;
      intercomOpen = false;
      linkSetupOpen = false;
    } catch {
      error = 'Could not restart the room.';
    }
  }

  function openIntercom(): void {
    linkSetupOpen = false;
    intercomOpen = true;
    unreadCount = 0;
  }

  /**
   * Clicking the screen means different things either side of the link coming
   * up: before, it explains how to get an operator on it; after, it is chat.
   */
  function openTerminal(): void {
    if (agentConnected) openIntercom();
    else {
      linkSetupOpen = true;
    }
  }

  function closeLinkSetup(): void {
    linkSetupOpen = false;
    requestAnimationFrame(() => sceneControls?.focus());
  }

  function closeIntercom(): void {
    intercomOpen = false;
    requestAnimationFrame(() => sceneControls?.focus());
  }

  function escape(): void {
    if (intercomOpen) closeIntercom();
    else if (linkSetupOpen) closeLinkSetup();
    else sceneControls?.escape();
  }
</script>

<main class:dom={domMode}>
  {#if !view || !sessionId || !visual || !theme}
    <div class="loading"><span></span><p>Establishing room telemetry</p></div>
  {:else}
    {#if domMode}
      <DomRoom {view} {roomLog} onaction={act} />
    {:else}
      <Scene
        {visual}
        {theme}
        {view}
        messages={intercomLog}
        {agentConnected}
        {inputMode}
        onaction={act}
        onkeypad={enterKeypad}
        onterminal={openTerminal}
        onready={(controls) => (sceneControls = controls)}
        onerror={(message) => (error = message)}
      />
    {/if}
    <Hud {view} {agentConnected} {roomLog} {intercomLog} {error} onrestart={restart} />
    <LinkSetup open={linkSetupOpen} {sessionId} onclose={closeLinkSetup} />
    <Intercom
      available={agentConnected}
      open={intercomOpen}
      {unreadCount}
      lines={intercomLog}
      onopen={openIntercom}
      onclose={closeIntercom}
      onsend={say}
      onselect={choose}
    />
  {/if}
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html, body, #app) { width: 100%; min-width: 20rem; height: 100%; margin: 0; }
  :global(body) { overflow: hidden; background: #101516; }
  main { position: relative; width: 100%; height: 100%; overflow: hidden; }
  main.dom { overflow-y: auto; background: #d9ddda; }
  .loading {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    color: #aeb8b1;
    background: radial-gradient(circle, #27302e, #0e1213 68%);
    font: 0.75rem ui-monospace, monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .loading span { width: 2rem; height: 2rem; margin: auto; border: 2px solid #52605a; border-top-color: #c6a05e; border-radius: 50%; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
