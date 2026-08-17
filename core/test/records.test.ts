import { describe, expect, it } from 'vitest';
import { RecordStore } from '../src/records.js';
import { pumpRoom } from '../src/rooms/pumpRoom.js';

describe('RecordStore', () => {
  const store = new RecordStore({
    'schematic:keypad': 'Entry order is: primary, secondary, return, overflow.',
    'work_orders:pipes': 'WO-2291: return and overflow swapped at the manifold.'
  });

  it('looks up an entry by kind and subject, case- and whitespace-insensitively', () => {
    expect(store.lookup('schematic', 'keypad')).toBe('Entry order is: primary, secondary, return, overflow.');
    expect(store.lookup('schematic', '  Keypad  ')).toBe('Entry order is: primary, secondary, return, overflow.');
  });

  it('returns null for an unknown subject', () => {
    expect(store.lookup('schematic', 'nonexistent')).toBeNull();
  });

  it('does not cross kinds', () => {
    expect(store.lookup('work_orders', 'keypad')).toBeNull();
  });

  it('corpus() lists every value and nothing else', () => {
    expect(store.corpus().sort()).toEqual(
      [
        'Entry order is: primary, secondary, return, overflow.',
        'WO-2291: return and overflow swapped at the manifold.'
      ].sort()
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(store)).toBe(true);
  });
});

describe('RecordStore — aliases', () => {
  const store = new RecordStore(
    { 'work_orders:pipes': 'WO-2291: return and overflow swapped at the manifold.' },
    { 'work_orders:manifold': 'pipes', 'work_orders:return': 'pipes' }
  );

  it('resolves an aliased subject to the canonical entry', () => {
    expect(store.lookup('work_orders', 'manifold')).toBe('WO-2291: return and overflow swapped at the manifold.');
    expect(store.lookup('work_orders', '  Return  ')).toBe('WO-2291: return and overflow swapped at the manifold.');
  });

  it('does not add the alias itself to the corpus — only the canonical value is ever returned', () => {
    expect(store.corpus()).toEqual(['WO-2291: return and overflow swapped at the manifold.']);
  });

  it('an alias only resolves within its own kind', () => {
    expect(store.lookup('maintenance_log', 'manifold')).toBeNull();
  });

  it('an alias pointing at a nonexistent canonical subject resolves to null, not a crash', () => {
    const broken = new RecordStore({}, { 'schematic:foo': 'bar' });
    expect(broken.lookup('schematic', 'foo')).toBeNull();
  });
});

describe('pump-room records', () => {
  it('connects crank, relay, and Gauge C language to the same maintenance history', () => {
    const crank = pumpRoom.records.lookup('work_orders', 'crank');
    expect(crank).toContain('spring return');
    expect(pumpRoom.records.lookup('work_orders', 'gauge c')).toBe(crank);
    expect(pumpRoom.records.lookup('schematic', 'k-12')).not.toMatch(/thirty|30/i);
    expect(pumpRoom.records.lookup('maintenance_log', 'bypass')).toContain('C glass');
  });

  it('resolves the pipe work order by identifier, year, and service description', () => {
    const pipeOrder = pumpRoom.records.lookup('work_orders', 'pipes');
    for (const subject of [
      'WO-2291',
      '2291',
      '1994',
      'pipe work',
      '1994 pipe work',
      'pipe service order',
      '1994 pipe service order'
    ]) {
      expect(pumpRoom.records.lookup('work_orders', subject)).toBe(pipeOrder);
    }
  });

  it('does not disclose Gauge C\'s hidden reading in the clue records', () => {
    const cRecords = [
      pumpRoom.records.lookup('work_orders', 'gauge c'),
      pumpRoom.records.lookup('maintenance_log', 'gauge c')
    ];
    expect(cRecords.every((entry) => entry !== null && !entry.includes('9'))).toBe(true);
  });
});
