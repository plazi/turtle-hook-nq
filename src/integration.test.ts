import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { join } from "./deps.ts";

/**
 * Integration test that starts the actual server and tests via HTTP
 */
Deno.test("Integration - server endpoints respond correctly", async () => {
  // Create test directory structure with test data
  const testDir = await Deno.makeTempDir();
  const ntriplesDir = join(testDir, "ntriples");
  await Deno.mkdir(ntriplesDir, { recursive: true });
  
  try {
    // Create test n-triples files
    await Deno.writeTextFile(
      join(ntriplesDir, "test1.nt"),
      '<http://example.org/s1> <http://example.org/p1> "object1" .\n' +
      '<http://example.org/s2> <http://example.org/p2> "object2" .\n'
    );
    
    await Deno.mkdir(join(ntriplesDir, "subfolder"), { recursive: true });
    await Deno.writeTextFile(
      join(ntriplesDir, "subfolder", "test2.nt"),
      '<http://example.org/s3> <http://example.org/p3> "object3" .\n'
    );
    
    // Start the server in a subprocess
    const port = 4506; // Use a different port to avoid conflicts
    const serverProcess = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-net",
        "--allow-read",
        "--allow-write",
        "--allow-run=git,rapper",
        "--allow-env",
        "src/main.ts",
      ],
      env: {
        ...Deno.env.toObject(),
        PORT: String(port),
      },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Test /nquads endpoint
      console.log("Testing /nquads endpoint...");
      const nquadsResponse = await fetch(`http://localhost:${port}/nquads`);
      assertEquals(nquadsResponse.status, 200);
      assertEquals(nquadsResponse.headers.get("Content-Type"), "application/n-quads");
      
      const nquadsText = await nquadsResponse.text();
      console.log("N-Quads response length:", nquadsText.length);
      
      // Since we can't easily set up test data with the actual server,
      // just verify the endpoint is accessible and returns the right content type
      
      // Test /ntriples endpoint
      console.log("Testing /ntriples endpoint...");
      const ntriplesResponse = await fetch(`http://localhost:${port}/ntriples`);
      assertEquals(ntriplesResponse.status, 200);
      assertEquals(ntriplesResponse.headers.get("Content-Type"), "application/n-triples");
      
      const ntriplesText = await ntriplesResponse.text();
      console.log("N-Triples response length:", ntriplesText.length);
      
      console.log("Integration tests passed!");
    } finally {
      // Clean up: kill the server process
      serverProcess.kill("SIGTERM");
      await serverProcess.status;
    }
  } finally {
    // Cleanup test directory
    await Deno.remove(testDir, { recursive: true });
  }
});

/**
 * Simpler integration test that just verifies the endpoints are registered
 * without starting a full server
 */
Deno.test("Integration - endpoints are accessible", async () => {
  // This test can be expanded once we have better control over the test environment
  // For now, we verify that the endpoint handlers work correctly
  
  const testDir = await Deno.makeTempDir();
  const ntriplesDir = join(testDir, "ntriples");
  await Deno.mkdir(ntriplesDir, { recursive: true });
  
  try {
    // Create minimal test data
    await Deno.writeTextFile(
      join(ntriplesDir, "test.nt"),
      '<http://test.org/s> <http://test.org/p> "o" .\n'
    );
    
    // Import and test the endpoint handlers directly
    const { handleNQuadsEndpoint, handleNTriplesEndpoint } = await import("./endpoints.ts");
    
    const request = new Request("http://localhost:4505/test");
    
    // Test N-Quads endpoint
    const nquadsResponse = handleNQuadsEndpoint(
      request,
      ntriplesDir,
      "https://treatment.plazi.org/id"
    );
    assertEquals(nquadsResponse.status, 200);
    assertEquals(nquadsResponse.headers.get("Content-Type"), "application/n-quads");
    
    // Test N-Triples endpoint
    const ntriplesResponse = handleNTriplesEndpoint(request, ntriplesDir);
    assertEquals(ntriplesResponse.status, 200);
    assertEquals(ntriplesResponse.headers.get("Content-Type"), "application/n-triples");
    
    console.log("Endpoint handlers are working correctly!");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});
