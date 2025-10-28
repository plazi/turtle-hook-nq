import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nqConfig } from "../config/config.ts";
import { existsSync } from "https://deno.land/x/ghact@1.2.6/src/deps.ts";
import { handleNQuads, handleNTriples } from "./endpoints.ts";

/**
 * Integration test that simulates the full workflow:
 * 1. Creates turtle files
 * 2. Converts them to n-triples using rapper (like worker.ts does)
 * 3. Tests the endpoints with the resulting files
 */
Deno.test("Integration: Full workflow from turtle to endpoints", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "integration-test-" });
  const turtleDir = await Deno.makeTempDir({ prefix: "turtle-test-" });
  
  try {
    (nqConfig as any).ntriplesDir = testDir;
    
    // Create test turtle files
    const turtle1 = `
@prefix ex: <http://example.org/> .
ex:subject1 ex:predicate1 "object1" .
ex:subject2 ex:predicate2 "object2" .
`;
    
    const turtle2 = `
@prefix ex: <http://example.org/> .
ex:subject3 ex:predicate3 "object3" .
`;
    
    await Deno.mkdir(`${turtleDir}/subdir`, { recursive: true });
    await Deno.writeTextFile(`${turtleDir}/test1.ttl`, turtle1);
    await Deno.writeTextFile(`${turtleDir}/subdir/test2.ttl`, turtle2);
    
    // Convert turtle files to n-triples (simulating what worker.ts does)
    const files = [
      { ttl: `${turtleDir}/test1.ttl`, nt: `${testDir}/test1.nt` },
      { ttl: `${turtleDir}/subdir/test2.ttl`, nt: `${testDir}/subdir/test2.nt` },
    ];
    
    for (const { ttl, nt } of files) {
      const ntDir = nt.substring(0, nt.lastIndexOf('/'));
      if (!existsSync(ntDir)) {
        await Deno.mkdir(ntDir, { recursive: true });
      }
      
      const command = new Deno.Command("rapper", {
        args: ["-i", "turtle", ttl, "-o", "ntriples"],
        stdout: "piped",
      });
      
      const output = await command.output();
      if (!output.success) {
        throw new Error(`rapper failed with status ${output.code}`);
      }
      
      await Deno.writeFile(nt, output.stdout);
    }
    
    // Test /ntriples endpoint
    const ntResponse = await handleNTriples();
    assertEquals(ntResponse.status, 200);
    assertEquals(ntResponse.headers.get("Content-Type"), "application/n-triples");
    
    const ntBody = await ntResponse.text();
    const ntLines = ntBody.trim().split("\n").filter(l => l.trim());
    
    // Should have 3 triples total
    assertEquals(ntLines.length, 3);
    
    // Verify content (no graph names)
    assert(ntBody.includes("subject1"));
    assert(ntBody.includes("subject2"));
    assert(ntBody.includes("subject3"));
    assert(!ntBody.includes("<https://treatment.plazi.org/id/"));
    
    // Test /nquads endpoint
    const nqResponse = await handleNQuads();
    assertEquals(nqResponse.status, 200);
    assertEquals(nqResponse.headers.get("Content-Type"), "application/n-quads");
    
    const nqBody = await nqResponse.text();
    const nqLines = nqBody.trim().split("\n").filter(l => l.trim());
    
    // Should have 3 quads total
    assertEquals(nqLines.length, 3);
    
    // All lines should have graph names
    for (const line of nqLines) {
      assert(line.includes("<https://treatment.plazi.org/id/"));
    }
    
    // Check that graph names are based on file paths
    assert(nqBody.includes("<https://treatment.plazi.org/id/test1>"));
    assert(nqBody.includes("<https://treatment.plazi.org/id/subdir/test2>"));
    
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
    await Deno.remove(turtleDir, { recursive: true }).catch(() => {});
  }
});
