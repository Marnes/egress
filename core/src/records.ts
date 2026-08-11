export type RecordKind = 'schematic' | 'work_orders' | 'maintenance_log';

function normalize(subject: string): string {
  return subject.trim().toLowerCase();
}

export class RecordStore {
  private readonly entries: ReadonlyMap<string, string>;
  private readonly aliases: ReadonlyMap<string, string>;

  /**
   * `aliases` maps alternate phrasings an agent might plausibly query (e.g. "manifold", "return
   * line") to the canonical subject already present in `entries` for that kind. Aliasing is
   * additive and never changes which strings are in the corpus — it only widens which query
   * strings resolve to an existing entry.
   */
  constructor(
    entries: Record<`${RecordKind}:${string}`, string>,
    aliases: Record<`${RecordKind}:${string}`, string> = {}
  ) {
    this.entries = new Map(Object.entries(entries));
    this.aliases = new Map(Object.entries(aliases));
    Object.freeze(this);
  }

  lookup(kind: RecordKind, subject: string): string | null {
    const key = `${kind}:${normalize(subject)}`;
    const direct = this.entries.get(key);
    if (direct !== undefined) return direct;

    const canonicalSubject = this.aliases.get(key);
    if (canonicalSubject === undefined) return null;
    return this.entries.get(`${kind}:${canonicalSubject}`) ?? null;
  }

  /** every string the agent is ever allowed to read from records */
  corpus(): readonly string[] {
    return [...this.entries.values()];
  }
}
