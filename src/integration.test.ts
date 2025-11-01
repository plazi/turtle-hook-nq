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
  
  console.log(`Test directory: ${testDir}`);
  console.log(`N-Triples directory: ${ntriplesDir}`);
  
  let serverProcess: Deno.ChildProcess | undefined;
  
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
    
    console.log("Test files created");
    
    // Find a free port
    const listener = Deno.listen({ port: 0 });
    const port = (listener.addr as Deno.NetAddr).port;
    listener.close();
    
    console.log(`Using port: ${port}`);
    
    // Start the server in a subprocess, pointing it to our test data
    serverProcess = new Deno.Command("deno", {
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
        WORKDIR: testDir, // Point to our test directory
        GHTOKEN: Deno.env.get("GHTOKEN") ?? "test",
        DENO_BACKTRACE: "1", // Enable full backtraces
      },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    
    // Collect server output for debugging
    const serverOutput: string[] = [];
    const serverErrors: string[] = [];
    
    // Read stdout/stderr in background
    const _stdoutReader = (async () => {
      try {
        for await (const chunk of serverProcess!.stdout) {
          const text = new TextDecoder().decode(chunk);
          serverOutput.push(text);
          console.log("[SERVER]", text.trim());
        }
      } catch (_e) {
        // stream closed
      }
    })();
    
    const _stderrReader = (async () => {
      try {
        for await (const chunk of serverProcess!.stderr) {
          const text = new TextDecoder().decode(chunk);
          serverErrors.push(text);
          console.error("[SERVER ERROR]", text.trim());
        }
      } catch (_e) {
        // stream closed
      }
    })();
    
    // Wait for server to start by checking a simple endpoint
    console.log("Waiting for server to start...");
    const maxWaitMs = 10000;
    const start = Date.now();
    let serverStarted = false;
    const timeoutIds: number[] = [];
    
    while (Date.now() - start < maxWaitMs) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        timeoutIds.push(timeoutId);
        
        // Try to connect without reading the body
        const resp = await fetch(`http://localhost:${port}/nquads`, {
          method: "HEAD", // Use HEAD to avoid triggering stream processing
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        console.log(`Server responded with status: ${resp.status}`);
        serverStarted = true;
        break;
      } catch (err) {
        // ignore connection errors while waiting
        if (err instanceof Error && err.name !== 'AbortError') {
          console.log(`Connection attempt failed: ${err.message}, retrying...`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    
    // Clear any remaining timeouts from the startup loop
    for (const id of timeoutIds) {
      clearTimeout(id);
    }
    
    if (!serverStarted) {
      throw new Error(
        `Server did not start within ${maxWaitMs}ms.\n` +
        `stdout:\n${serverOutput.join("")}\n` +
        `stderr:\n${serverErrors.join("")}`
      );
    }
    
    console.log("Server started successfully");
    
    // Give the server a moment to fully initialize
    await new Promise((r) => setTimeout(r, 500));
    
    // Test /nquads endpoint
    console.log("Testing /nquads endpoint...");
    const nquadsController = new AbortController();
    const nquadsTimeout = setTimeout(() => nquadsController.abort(), 10000);
    
    try {
      const nquadsResponse = await fetch(`http://localhost:${port}/nquads`, {
        signal: nquadsController.signal,
      });
      console.log(`/nquads response status: ${nquadsResponse.status}`);
      console.log(`/nquads response headers:`, Object.fromEntries(nquadsResponse.headers.entries()));
      
      assertEquals(nquadsResponse.status, 200);
      assertEquals(nquadsResponse.headers.get("Content-Type"), "application/n-quads");
      
      // Read the response body chunk by chunk
      const chunks: string[] = [];
      const reader = nquadsResponse.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader");
      }
      
      try {
        let chunkCount = 0;
        while (true) {
          console.log(`Reading chunk ${++chunkCount}...`);
          const { done, value } = await reader.read();
          if (done) {
            console.log("Stream completed successfully");
            break;
          }
          const text = new TextDecoder().decode(value);
          chunks.push(text);
          console.log(`Received chunk ${chunkCount}: ${text.length} bytes`);
          
          // Log first few chunks for debugging
          if (chunkCount <= 3) {
            console.log(`Chunk ${chunkCount} content preview:`, text.substring(0, 100));
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      const nquadsText = chunks.join("");
      console.log("N-Quads total response length:", nquadsText.length);
      console.log("N-Quads sample:", nquadsText.substring(0, 200));
      
      // Verify we got the expected data
      assertEquals(nquadsText.includes("example.org/s1"), true);
      assertEquals(nquadsText.includes("example.org/s2"), true);
      assertEquals(nquadsText.includes("example.org/s3"), true);
      assertEquals(nquadsText.includes("treatment.plazi.org/id/test1"), true);
      assertEquals(nquadsText.includes("treatment.plazi.org/id/test2"), true);
    } catch (e) {
      console.error("Error fetching /nquads:", e);
      console.error("Server output so far:", serverOutput.join(""));
      console.error("Server errors so far:", serverErrors.join(""));
      throw e;
    } finally {
      clearTimeout(nquadsTimeout);
    }
    
    console.log("Integration tests passed!");
  } finally {
    // Clean up: kill the server process
    if (serverProcess) {
      console.log("Cleaning up server process...");
      try {
        serverProcess.kill("SIGTERM");
      } catch (e) {
        if (e instanceof TypeError && String(e.message).includes("already terminated")) {
          console.warn("Server process was already terminated");
        } else {
          console.error("Error killing server process:", e);
        }
      }
      
      // Wait for process to exit
      await serverProcess.status;
    }
    
    // Cleanup test directory
    console.log("Cleaning up test directory...");
    await Deno.remove(testDir, { recursive: true });
  }
});

/**
 * Unit test that verifies the endpoint handlers work correctly
 * without starting a full server
 */
Deno.test("Integration - endpoints are accessible", async () => {
  const testDir = await Deno.makeTempDir();
  const ntriplesDir = join(testDir, "ntriples");
  await Deno.mkdir(ntriplesDir, { recursive: true });
  
  try {
    // Create minimal test data
    const testFile = join(ntriplesDir, "test.nt");
    await Deno.writeTextFile(
      testFile,
      '<http://test.org/s> <http://test.org/p> "o" .\n'
    );
    
    // Import and test the endpoint handlers directly
    const { handleNQuadsEndpoint, handleNTriplesEndpoint } = await import("./endpoints.ts");
    
    const request = new Request("http://example.com/test");
    
    // Test N-Quads endpoint
    const nquadsResponse = handleNQuadsEndpoint(
      request,
      ntriplesDir,
      "https://treatment.plazi.org/id"
    );
    assertEquals(nquadsResponse.status, 200);
    assertEquals(nquadsResponse.headers.get("Content-Type"), "application/n-quads");
    
    // Actually read the stream to verify it works
    const nquadsText = await nquadsResponse.text();
    assertEquals(nquadsText.includes("test.org/s"), true);
    assertEquals(nquadsText.includes("treatment.plazi.org/id/test"), true);
    
    // Test N-Triples endpoint
    const ntriplesResponse = handleNTriplesEndpoint(request, ntriplesDir);
    assertEquals(ntriplesResponse.status, 200);
    assertEquals(ntriplesResponse.headers.get("Content-Type"), "application/n-triples");
    
    // Actually read the stream to verify it works
    const ntriplesText = await ntriplesResponse.text();
    assertEquals(ntriplesText.includes("test.org/s"), true);
    
    console.log("Endpoint handlers are working correctly!");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});
