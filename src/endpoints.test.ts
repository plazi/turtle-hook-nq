import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNQuadsEndpoint, handleNTriplesEndpoint } from "./endpoints.ts";

Deno.test("handleNQuadsEndpoint - generates n-quads with graph names", async () => {
  // Create test directory structure
  const testDir = await Deno.makeTempDir();
  const testGraphUriPrefix = "https://treatment.plazi.org/id";
  
  try {
    // Create test n-triples files
    await Deno.writeTextFile(
      `${testDir}/test1.nt`,
      '<http://example.org/s1> <http://example.org/p1> "o1" .\n' +
      '<http://example.org/s2> <http://example.org/p2> "o2" .\n'
    );
    
    await Deno.mkdir(`${testDir}/subfolder`, { recursive: true });
    await Deno.writeTextFile(
      `${testDir}/subfolder/test2.nt`,
      '<http://example.org/s3> <http://example.org/p3> "o3" .\n'
    );
    
    // Create a mock request
    const request = new Request("http://localhost:4505/nquads");
    
    // Call the handler with test config
    const response = await handleNQuadsEndpoint(request, testDir, testGraphUriPrefix);
    
    // Verify response
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/n-quads");
    
    // Read the response body
    const text = await response.text();
    
    // Verify the output contains quads with graph names
    assertEquals(text.includes("<https://treatment.plazi.org/id/test1>"), true);
    assertEquals(text.includes("<https://treatment.plazi.org/id/test2>"), true);
    assertEquals(text.includes('<http://example.org/s1>'), true);
    assertEquals(text.includes('<http://example.org/s3>'), true);
    
    // Verify lines end with graph name and period
    const lines = text.trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        assertEquals(line.includes("> ."), true, `Line should end with > .: ${line}`);
      }
    }
  } finally {
    // Cleanup
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNTriplesEndpoint - concatenates n-triples files", async () => {
  // Create test directory structure
  const testDir = await Deno.makeTempDir();
  
  try {
    // Create test n-triples files
    const content1 = '<http://example.org/s1> <http://example.org/p1> "o1" .\n';
    const content2 = '<http://example.org/s2> <http://example.org/p2> "o2" .\n';
    
    await Deno.writeTextFile(`${testDir}/test1.nt`, content1);
    await Deno.writeTextFile(`${testDir}/test2.nt`, content2);
    
    // Create a mock request
    const request = new Request("http://localhost:4505/ntriples");
    
    // Call the handler with test config
    const response = await handleNTriplesEndpoint(request, testDir);
    
    // Verify response
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/n-triples");
    
    // Read the response body
    const text = await response.text();
    
    // Verify the output contains both files' content
    assertEquals(text.includes('<http://example.org/s1>'), true);
    assertEquals(text.includes('<http://example.org/s2>'), true);
    
    // Verify no graph names are added
    assertEquals(text.includes("<https://treatment.plazi.org/id/"), false);
  } finally {
    // Cleanup
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNQuadsEndpoint - handles empty directory", async () => {
  // Create test directory structure
  const testDir = await Deno.makeTempDir();
  const testGraphUriPrefix = "https://treatment.plazi.org/id";
  
  try {
    // Create a mock request
    const request = new Request("http://localhost:4505/nquads");
    
    // Call the handler with test config
    const response = await handleNQuadsEndpoint(request, testDir, testGraphUriPrefix);
    
    // Verify response
    assertEquals(response.status, 200);
    
    // Read the response body
    const text = await response.text();
    
    // Should be empty or whitespace only
    assertEquals(text.trim(), "");
  } finally {
    // Cleanup
    await Deno.remove(testDir, { recursive: true });
  }
});
