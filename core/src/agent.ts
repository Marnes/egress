import { fromLiteral } from './safeText.js';

/**
 * What the voice on the other end of the intercom calls itself. This is the
 * single place it is named — the briefing, the room log, and the player's UI
 * all read from here, so renaming the operator is a one-line change.
 */
export const AGENT_NAME = fromLiteral('EGRESS');
export const AGENT_EXPANSION = fromLiteral('Emergency Guidance and Remote Engineering Support System');
