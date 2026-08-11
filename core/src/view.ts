import { sumpLevelMm } from './room.js';
import type { PlayerView, PlayerViewObject, RoomSpec, RoomState } from './types.js';

export function playerView(spec: RoomSpec, state: RoomState, now: number): PlayerView {
  const objects: PlayerViewObject[] = spec.objects.map((obj) => {
    const obstruction = obj.gaugeObscured?.(state, now) ?? null;
    return {
      id: obj.id,
      label: obj.label,
      stencil: obj.stencil,
      gauge: obj.reading
        ? obj.reading(state, now)
        : obj.gauge !== undefined && state.powerOn && obstruction === null
          ? obj.gauge
          : null,
      gaugeObscured: obstruction !== null,
      actions: obj.actions.map((a) => ({
        id: a.id,
        label: a.label,
        enabled: a.needs ? a.needs(state, now) : true,
        disabledLabel: a.disabledLabel,
        input: a.input
      }))
    };
  });

  return {
    roomId: spec.id,
    roomName: spec.name,
    objects,
    switches: state.switches,
    lightsOn: state.lightsOn,
    powerOn: state.powerOn,
    panelLocked: state.panelLocked,
    doorOpen: state.doorOpen,
    valveOpen: state.valveOpen,
    pumpRunning: state.pumpRunning,
    sumpMm: sumpLevelMm(state, now),
    complete: spec.isComplete(state)
  };
}
