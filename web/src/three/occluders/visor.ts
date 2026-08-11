import type { OccluderInstance } from './registry.js';

export function visor(): OccluderInstance {
  throw new Error('Occluder "visor" is declared but not implemented');
}
