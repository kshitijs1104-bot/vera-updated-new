// Shared by arithmeticCheck.ts and groundedness.ts — one recursive walk
// instead of two near-identical ones. Returns each string field
// SEPARATELY (never flattened into one blob): the arithmetic check needs
// same-passage proximity to avoid pairing unrelated numbers, while the
// currency check doesn't care about proximity and can join them itself.
// Card `content` is untyped (`{}` in the OpenAPI schema) by design, so this
// has to be shape-agnostic rather than walking known card fields.
export function collectResponseStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectResponseStrings(v, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectResponseStrings(v, acc);
    return acc;
  }
  return acc;
}
