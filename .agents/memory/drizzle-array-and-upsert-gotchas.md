---
name: Drizzle ORM array queries and upsert races
description: Pitfalls when filtering by an array of IDs or doing get-or-create against a unique column in Drizzle ORM + Postgres.
---

## Filtering by an array of IDs

Do not write `sql\`${column} = ANY(${idsArray}::int[])\`` — the driver serializes
a plain JS array interpolated into a `sql` template as a string like `"1,2,3"`,
which Postgres rejects as a malformed array literal (`malformed array literal: "1"`).

**Fix:** use Drizzle's `inArray(column, idsArray)` operator instead. It handles
parameterization correctly.

**Why:** Hit this in production-shaped code where a reactions-count query filtered
`reactions.thought_id` by the list of thought IDs on the page — worked with a single
ID but broke as soon as there were 2+ thoughts, since the array-to-SQL serialization
path is different from scalar interpolation.

## Get-or-create against a unique column

A naive `select ... ; if not found insert ...` for a per-session/per-user settings
row is subject to a race: two near-simultaneous requests for a brand-new session
both see "no row", both try to insert, and the second insert throws a unique
constraint violation (500).

**Fix:** `db.insert(table).values({...}).onConflictDoNothing({ target: table.uniqueCol }).returning()`,
then if that returns nothing (lost the race), re-`select` for the row that the
other request just created.

**How to apply:** Anywhere you have a "getOrCreateX(key)" helper backed by a
column with a unique constraint, prefer this insert-with-onConflictDoNothing +
fallback-select pattern over select-then-insert.
