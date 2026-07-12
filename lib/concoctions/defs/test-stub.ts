// lib/concoctions/defs/test-stub.ts — shared Supabase builder-chain stub for def
// tests. Mirrors the exact chains the loaders use: .schema()?.from().select()
// [.is()|.eq()|.order()]* then await. Captures calls for predicate assertions.
export function stubSb(rows: unknown[], capture: Record<string, unknown> = {}) {
  const result = Promise.resolve({ data: rows, error: null });
  const builder: {
    select: (cols: string) => typeof builder;
    is: (col: string, v: unknown) => typeof builder;
    eq: (col: string, v: unknown) => typeof builder;
    order: (col: string, opts?: unknown) => typeof builder;
    then: typeof result.then;
  } = {
    select: (cols: string) => {
      capture.select = cols;
      return builder;
    },
    is: (col: string, v: unknown) => {
      capture[`is:${col}`] = v;
      return builder;
    },
    eq: (col: string, v: unknown) => {
      capture[`eq:${col}`] = v;
      return builder;
    },
    order: (col: string, opts?: unknown) => {
      capture.order = { col, opts };
      return builder;
    },
    then: result.then.bind(result),
  };
  const root = {
    from: (table: string) => {
      capture.table = table;
      return builder;
    },
    schema: (name: string) => {
      capture.schema = name;
      return root;
    },
  };
  return root;
}
