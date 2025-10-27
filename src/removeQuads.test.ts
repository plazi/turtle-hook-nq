import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import removeQuads from "./removeQuads.ts";

Deno.test("removeQuads - removes quads with specified graph names", async () => {
  const testFile = await Deno.makeTempFile({ suffix: ".nq" });
  
  try {
    // Create test data with various graph names
    const testData = [
      '<http://example.org/subject1> <http://example.org/predicate1> "object1" <http://graph1> .',
      '<http://example.org/subject2> <http://example.org/predicate2> "object2" <http://graph2> .',
      '<http://example.org/subject3> <http://example.org/predicate3> "object3" <http://graph1> .',
      '<http://example.org/subject4> <http://example.org/predicate4> "object4" <http://graph3> .',
      '<http://example.org/subject5> <http://example.org/predicate5> "object5" <http://graph2> .',
    ].join("\n") + "\n";
    
    await Deno.writeTextFile(testFile, testData);
    
    // Remove quads from graph1 and graph2
    await removeQuads(testFile, "<http://graph1>", "<http://graph2>");
    
    // Read the result
    const result = await Deno.readTextFile(testFile);
    const resultLines = result.trim().split("\n").filter(line => line.trim());
    
    // Should only have graph3 quad remaining
    assertEquals(resultLines.length, 1);
    assertEquals(
      resultLines[0],
      '<http://example.org/subject4> <http://example.org/predicate4> "object4" <http://graph3> .'
    );
  } finally {
    try {
      await Deno.remove(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("removeQuads - handles empty file", async () => {
  const testFile = await Deno.makeTempFile({ suffix: ".nq" });
  
  try {
    await Deno.writeTextFile(testFile, "");
    await removeQuads(testFile, "<http://graph1>");
    
    const result = await Deno.readTextFile(testFile);
    assertEquals(result, "");
  } finally {
    try {
      await Deno.remove(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("removeQuads - handles file with no matching graphs", async () => {
  const testFile = await Deno.makeTempFile({ suffix: ".nq" });
  
  try {
    const testData = [
      '<http://example.org/subject1> <http://example.org/predicate1> "object1" <http://graph1> .',
      '<http://example.org/subject2> <http://example.org/predicate2> "object2" <http://graph2> .',
    ].join("\n") + "\n";
    
    await Deno.writeTextFile(testFile, testData);
    await removeQuads(testFile, "<http://graph3>", "<http://graph4>");
    
    const result = await Deno.readTextFile(testFile);
    assertEquals(result, testData);
  } finally {
    try {
      await Deno.remove(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("removeQuads - handles large file with batching", async () => {
  const testFile = await Deno.makeTempFile({ suffix: ".nq" });
  
  try {
    // Create a large file with 5000 quads
    const lines: string[] = [];
    for (let i = 0; i < 5000; i++) {
      const graph = i % 3 === 0 ? "<http://remove>" : "<http://keep>";
      lines.push(`<http://s${i}> <http://p${i}> "o${i}" ${graph} .`);
    }
    
    await Deno.writeTextFile(testFile, lines.join("\n") + "\n");
    await removeQuads(testFile, "<http://remove>");
    
    const result = await Deno.readTextFile(testFile);
    const resultLines = result.trim().split("\n").filter(line => line.trim());
    
    // Should have approximately 3333 lines (those not divisible by 3)
    assertEquals(resultLines.length, Math.floor(5000 * 2 / 3));
    
    // Verify no removed graphs remain
    for (const line of resultLines) {
      assertEquals(line.includes("<http://remove>"), false);
    }
  } finally {
    try {
      await Deno.remove(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("removeQuads - handles malformed lines gracefully", async () => {
  const testFile = await Deno.makeTempFile({ suffix: ".nq" });
  
  try {
    const testData = [
      '<http://example.org/subject1> <http://example.org/predicate1> "object1" <http://graph1> .',
      '', // empty line
      '   ', // whitespace only
      '<http://invalid>', // malformed - too few parts
      '<http://example.org/subject2> <http://example.org/predicate2> "object2" <http://graph2> .',
    ].join("\n") + "\n";
    
    await Deno.writeTextFile(testFile, testData);
    await removeQuads(testFile, "<http://graph1>");
    
    const result = await Deno.readTextFile(testFile);
    const resultLines = result.trim().split("\n").filter(line => line.trim());
    
    // Should only have graph2 quad (malformed lines are skipped)
    assertEquals(resultLines.length, 1);
    assertEquals(
      resultLines[0],
      '<http://example.org/subject2> <http://example.org/predicate2> "object2" <http://graph2> .'
    );
  } finally {
    try {
      await Deno.remove(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("removeQuads - preserves quads without graph names", async () => {
  const testFile = await Deno.makeTempFile({ suffix: ".nq" });
  
  try {
    const testData = [
      '<http://example.org/subject1> <http://example.org/predicate1> "object1" .',
      '<http://example.org/subject2> <http://example.org/predicate2> "object2" <http://graph1> .',
      '<http://example.org/subject3> <http://example.org/predicate3> "object3" .',
    ].join("\n") + "\n";
    
    await Deno.writeTextFile(testFile, testData);
    await removeQuads(testFile, "<http://graph1>");
    
    const result = await Deno.readTextFile(testFile);
    const resultLines = result.trim().split("\n").filter(line => line.trim());
    
    // Should have 2 quads without graph names
    assertEquals(resultLines.length, 2);
    assertEquals(
      resultLines[0],
      '<http://example.org/subject1> <http://example.org/predicate1> "object1" .'
    );
    assertEquals(
      resultLines[1],
      '<http://example.org/subject3> <http://example.org/predicate3> "object3" .'
    );
  } finally {
    try {
      await Deno.remove(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
});
