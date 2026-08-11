import type { RecordStore } from './records.js';

declare const brand: unique symbol;

/**
 * A string that has been proven, at the point it was constructed, to be safe
 * to hand to the agent: either a compile-time literal, a member of a room's
 * frozen record corpus, or something the player actually typed. Nothing else
 * type-checks as this type, and the constructors below are the only way to
 * produce one.
 */
export type AgentSafeText = string & { readonly [brand]: 'agent-safe' };

/** Rejects `S` unless it is a narrower type than plain `string` — i.e. an actual literal. */
type StaticLiteral<S extends string> = string extends S ? never : S;

export function fromLiteral<S extends string>(s: StaticLiteral<S>): AgentSafeText {
  return s as string as AgentSafeText;
}

export function fromRecord(store: RecordStore, s: string): AgentSafeText {
  if (!store.corpus().includes(s)) {
    throw new Error(`fromRecord: "${s}" is not in the record corpus`);
  }
  return s as AgentSafeText;
}

/** Structural — satisfied by server's Session without core depending on server. */
export type PlayerMessageSource = { readonly playerMessages: readonly string[] };

export function fromPlayer(source: PlayerMessageSource, s: string): AgentSafeText {
  if (!source.playerMessages.includes(s)) {
    throw new Error(`fromPlayer: "${s}" was not typed by the player`);
  }
  return s as AgentSafeText;
}

/** Structural proof that a selected label was one of the choices previously offered by the agent. */
export type AgentChoiceSource = {
  readonly intercomLog: readonly {
    readonly choice?: {
      readonly id: string;
      readonly options: readonly { readonly id: string; readonly label: string }[];
    };
  }[];
};

export function fromAgentChoice(
  source: AgentChoiceSource,
  choiceId: string,
  optionId: string
): AgentSafeText {
  const choice = source.intercomLog.find((line) => line.choice?.id === choiceId)?.choice;
  const option = choice?.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`fromAgentChoice: unknown choice "${choiceId}:${optionId}"`);
  return option.label as AgentSafeText;
}

/**
 * Combines already-safe pieces with literal glue text — safe because every
 * interpolated value must already be `AgentSafeText`; a raw `string` will not
 * type-check as a tag value here, so this cannot be used to smuggle unvetted
 * data past the boundary the way a plain template literal could.
 */
export function safeTemplate(strings: TemplateStringsArray, ...values: AgentSafeText[]): AgentSafeText {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '') as AgentSafeText;
}
