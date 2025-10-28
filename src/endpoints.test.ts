import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNQuads, handleNTriples } from "./endpoints.ts";
import { nqConfig } from "../config/config.ts";
import { existsSync } from "https://deno.land/x/ghact@1.2.6/src/deps.ts";

// Helper to create test n-triples files
async function createTestFiles(testDir: string, files: Record<string, string>) {
  await Deno.mkdir(testDir, { recursive: true });
  
  for (const [path, content] of Object.entries(files)) {
    const fullPath = `${testDir}/${path}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      await Deno.mkdir(dir, { recursive: true });
    }
    await Deno.writeTextFile(fullPath, content);
  }
}

Deno.test("handleNQuads - returns empty response when no files exist", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "nq-test-" });
  
  try {
    // Override the config temporarily
    (nqConfig as any).ntriplesDir = testDir;
    
    const response = await handleNQuads();
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/n-quads");
    
    const body = await response.text();
    assertEquals(body, "");
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("handleNQuads - converts n-triples to n-quads with graph names", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "nq-test-" });
  
  try {
    (nqConfig as any).ntriplesDir = testDir;
    
    await createTestFiles(testDir, {
      "test1.nt": '<http://example.org/subject1> <http://example.org/predicate1> "object1" .\n<http://example.org/subject2> <http://example.org/predicate2> "object2" .',
      "test2.nt": '<http://example.org/subject3> <http://example.org/predicate3> "object3" .',
    });
    
    const response = await handleNQuads();
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/n-quads");
    
    const body = await response.text();
    const lines = body.trim().split("\n").filter(l => l.trim());
    
    // Should have 3 quads (one per triple)
    assertEquals(lines.length, 3);
    
    // Each line should end with a graph name
    for (const line of lines) {
      assert(line.includes("<https://treatment.plazi.org/id/test"));
      assert(line.endsWith("> ."));
    }
    
    // Check that graph names are based on filenames
    assert(body.includes("<https://treatment.plazi.org/id/test1>"));
    assert(body.includes("<https://treatment.plazi.org/id/test2>"));
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("handleNQuads - handles subdirectories", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "nq-test-" });
  
  try {
    (nqConfig as any).ntriplesDir = testDir;
    
    await createTestFiles(testDir, {
      "subdir/test.nt": '<http://example.org/subject> <http://example.org/predicate> "object" .',
    });
    
    const response = await handleNQuads();
    assertEquals(response.status, 200);
    
    const body = await response.text();
    // The graph name should include the subdirectory path
    assert(body.includes("<https://treatment.plazi.org/id/subdir/test>"));
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("handleNTriples - returns empty response when no files exist", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "nt-test-" });
  
  try {
    (nqConfig as any).ntriplesDir = testDir;
    
    const response = await handleNTriples();
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/n-triples");
    
    const body = await response.text();
    assertEquals(body, "");
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("handleNTriples - concatenates all n-triples files", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "nt-test-" });
  
  try {
    (nqConfig as any).ntriplesDir = testDir;
    
    await createTestFiles(testDir, {
      "test1.nt": '<http://example.org/subject1> <http://example.org/predicate1> "object1" .\n<http://example.org/subject2> <http://example.org/predicate2> "object2" .',
      "test2.nt": '<http://example.org/subject3> <http://example.org/predicate3> "object3" .',
    });
    
    const response = await handleNTriples();
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/n-triples");
    
    const body = await response.text();
    const lines = body.trim().split("\n").filter(l => l.trim());
    
    // Should have 3 triples
    assertEquals(lines.length, 3);
    
    // Should NOT contain graph names
    for (const line of lines) {
      assert(!line.includes("<https://treatment.plazi.org/id/"));
    }
    
    // Check content
    assert(body.includes('<http://example.org/subject1> <http://example.org/predicate1> "object1" .'));
    assert(body.includes('<http://example.org/subject2> <http://example.org/predicate2> "object2" .'));
    assert(body.includes('<http://example.org/subject3> <http://example.org/predicate3> "object3" .'));
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("handleNTriples - skips empty lines and comments", async () => {
  const originalDir = nqConfig.ntriplesDir;
  const testDir = await Deno.makeTempDir({ prefix: "nt-test-" });
  
  try {
    (nqConfig as any).ntriplesDir = testDir;
    
    await createTestFiles(testDir, {
      "test.nt": '# This is a comment\n\n<http://example.org/subject> <http://example.org/predicate> "object" .\n\n# Another comment',
    });
    
    const response = await handleNTriples();
    const body = await response.text();
    const lines = body.trim().split("\n").filter(l => l.trim());
    
    // Should only have 1 triple (no comments or empty lines)
    assertEquals(lines.length, 1);
    assertEquals(lines[0], '<http://example.org/subject> <http://example.org/predicate> "object" .');
  } finally {
    (nqConfig as any).ntriplesDir = originalDir;
    await Deno.remove(testDir, { recursive: true }).catch(() => {});
  }
});
