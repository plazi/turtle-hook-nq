import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapLimited, ttlWork } from "./files.ts";

const paths = (n: number, ext = ".ttl") =>
  Array.from({ length: n }, (_, i) => `data/${i.toString(16)}${ext}`);

Deno.test("ttlWork - handles a commit modifying 500,000 files", () => {
  // The plazi/gg2rdf#42 rewrite modified 204,031 files at once; the old
  // `push(...modified)` threw "Maximum call stack size exceeded" on it.
  const modified = paths(500_000);
  const { toAdd, toRemove } = ttlWork({ added: [], modified, removed: [] });
  assertEquals(toAdd.length, 500_000);
  assertEquals(toRemove.length, 500_000);
  assertEquals(toAdd[499_999], modified[499_999]);
});

Deno.test("ttlWork - modified counts as removed and added, non-ttl dropped", () => {
  const { toAdd, toRemove } = ttlWork({
    added: ["a.ttl", "README.md"],
    modified: ["m.ttl", "m.xml"],
    removed: ["r.ttl", "dataset.json"],
  });
  assertEquals(toAdd, ["a.ttl", "m.ttl"]);
  assertEquals(toRemove, ["r.ttl", "m.ttl"]);
});

Deno.test("mapLimited - keeps order and never exceeds the limit", async () => {
  let running = 0;
  let peak = 0;
  const items = Array.from({ length: 1000 }, (_, i) => i);
  const out = await mapLimited(items, 8, async (i) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 0));
    running--;
    return i * 2;
  });
  assertEquals(out, items.map((i) => i * 2));
  assertEquals(peak, 8);
});

Deno.test("mapLimited - empty input", async () => {
  assertEquals(await mapLimited([], 8, async (x) => x), []);
});
