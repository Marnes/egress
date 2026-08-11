import { describe, expect, it } from 'vitest';
import { RecordStore } from '../src/records.js';
import { fromAgentChoice, fromLiteral, fromPlayer, fromRecord } from '../src/safeText.js';

describe('fromLiteral', () => {
  it('accepts a compile-time string literal', () => {
    expect(fromLiteral('The intercom crackles.')).toBe('The intercom crackles.');
  });

  it('rejects a runtime-constructed string at compile time', () => {
    const gaugeReading = 7;
    // @ts-expect-error fromLiteral must not accept a computed/widened string
    fromLiteral(`Gauge A reads ${gaugeReading}.`);
  });
});

describe('fromRecord', () => {
  const store = new RecordStore({ 'schematic:keypad': 'Entry order is: primary, secondary.' });

  it('accepts a string that is actually in the corpus', () => {
    expect(fromRecord(store, 'Entry order is: primary, secondary.')).toBe(
      'Entry order is: primary, secondary.'
    );
  });

  it('throws — the leak guard — for a fabricated string that leaks live state', () => {
    const gaugeReading = 7;
    expect(() => fromRecord(store, `Gauge A reads ${gaugeReading}.`)).toThrow(
      /is not in the record corpus/
    );
  });
});

describe('fromPlayer', () => {
  const session = { playerMessages: ['help, the door is stuck'] };

  it('accepts a string the player actually typed', () => {
    expect(fromPlayer(session, 'help, the door is stuck')).toBe('help, the door is stuck');
  });

  it('throws for a string the player never typed', () => {
    expect(() => fromPlayer(session, 'the gauges read 7 3 9 1')).toThrow(/was not typed by the player/);
  });
});

describe('fromAgentChoice', () => {
  const source = {
    intercomLog: [
      {
        choice: {
          id: 'choice-1',
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' }
          ]
        }
      }
    ]
  };

  it('accepts a label previously offered by the agent', () => {
    expect(fromAgentChoice(source, 'choice-1', 'yes')).toBe('Yes');
  });

  it('rejects an option that was never offered', () => {
    expect(() => fromAgentChoice(source, 'choice-1', 'maybe')).toThrow(/unknown choice/);
  });
});
