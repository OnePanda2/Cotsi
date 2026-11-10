// Per-user key/value storage. Production uses one Postgres table through Supabase;
// local development and tests use the in-memory store (optionally saved to a file).

export interface Store {
  get<T>(user: string, key: string): Promise<T | null>;
  put(user: string, key: string, value: unknown): Promise<void>;
  del(user: string, key: string): Promise<void>;
  list<T>(user: string, prefix: string): Promise<{ key: string; value: T }[]>;
  /** Atomically add numbers to fields of a JSON object and return the new totals. */
  bump(user: string, key: string, fields: Record<string, number>): Promise<Record<string, number>>;
  deleteUser(user: string): Promise<void>;
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export class SupabaseStore implements Store {
  constructor(private db: SupabaseLike) {}

  async get<T>(user: string, key: string): Promise<T | null> {
    const { data, error } = await this.db.from("cotsi_kv").select("value").eq("user_id", user).eq("key", key).maybeSingle();
    if (error) throw new Error(`store.get: ${error.message}`);
    return data ? (data.value as T) : null;
  }

  async put(user: string, key: string, value: unknown): Promise<void> {
    const { error } = await this.db
      .from("cotsi_kv")
      .upsert({ user_id: user, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw new Error(`store.put: ${error.message}`);
  }

  async del(user: string, key: string): Promise<void> {
    const { error } = await this.db.from("cotsi_kv").delete().eq("user_id", user).eq("key", key);
    if (error) throw new Error(`store.del: ${error.message}`);
  }

  async list<T>(user: string, prefix: string): Promise<{ key: string; value: T }[]> {
    const { data, error } = await this.db
      .from("cotsi_kv")
      .select("key,value")
      .eq("user_id", user)
      .like("key", `${prefix.replace(/[%_\\]/g, "\\$&")}%`);
    if (error) throw new Error(`store.list: ${error.message}`);
    return (data ?? []) as { key: string; value: T }[];
  }

  async bump(user: string, key: string, fields: Record<string, number>): Promise<Record<string, number>> {
    const { data, error } = await this.db.rpc("cotsi_bump", { p_user: user, p_key: key, p_fields: fields });
    if (error) throw new Error(`store.bump: ${error.message}`);
    return (data ?? {}) as Record<string, number>;
  }

  async deleteUser(user: string): Promise<void> {
    const { error } = await this.db.from("cotsi_kv").delete().eq("user_id", user);
    if (error) throw new Error(`store.deleteUser: ${error.message}`);
  }
}

export class MemoryStore implements Store {
  data = new Map<string, unknown>();
  constructor(private onChange?: (data: Map<string, unknown>) => void) {}

  private k(user: string, key: string) {
    return `${user}\u0000${key}`;
  }
  private changed() {
    this.onChange?.(this.data);
  }

  get<T>(user: string, key: string): Promise<T | null> {
    const v = this.data.get(this.k(user, key));
    return Promise.resolve(v === undefined ? null : (structuredClone(v) as T));
  }
  put(user: string, key: string, value: unknown): Promise<void> {
    this.data.set(this.k(user, key), structuredClone(value));
    this.changed();
    return Promise.resolve();
  }
  del(user: string, key: string): Promise<void> {
    this.data.delete(this.k(user, key));
    this.changed();
    return Promise.resolve();
  }
  list<T>(user: string, prefix: string): Promise<{ key: string; value: T }[]> {
    const start = this.k(user, prefix);
    const out: { key: string; value: T }[] = [];
    for (const [k, v] of this.data) {
      if (k.startsWith(start)) out.push({ key: k.slice(user.length + 1), value: structuredClone(v) as T });
    }
    return Promise.resolve(out);
  }
  bump(user: string, key: string, fields: Record<string, number>): Promise<Record<string, number>> {
    const cur = (this.data.get(this.k(user, key)) as Record<string, number> | undefined) ?? {};
    const next = { ...cur };
    for (const [f, n] of Object.entries(fields)) next[f] = (next[f] ?? 0) + n;
    this.data.set(this.k(user, key), next);
    this.changed();
    return Promise.resolve({ ...next });
  }
  deleteUser(user: string): Promise<void> {
    for (const k of [...this.data.keys()]) if (k.startsWith(`${user}\u0000`)) this.data.delete(k);
    this.changed();
    return Promise.resolve();
  }
}
