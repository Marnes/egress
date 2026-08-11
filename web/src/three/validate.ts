import { validateRoomVisual as validateCoreRoomVisual } from '@egress/core';
import type { Issue, RoomVisual, Theme } from '@egress/core';

export type ValidationContext = {
  objectIds?: readonly string[];
  propTypes: readonly string[];
  themes: readonly Theme[];
};

export function validateRoomVisual(visual: RoomVisual, context: ValidationContext): Issue[] {
  return validateCoreRoomVisual(visual, {
    objectIds:
      context.objectIds ??
      visual.props.flatMap((prop) => (prop.objectId === undefined ? [] : [prop.objectId])),
    propTypes: context.propTypes,
    themes: context.themes
  });
}
