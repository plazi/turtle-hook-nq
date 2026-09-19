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
    
    // Verify data lines end with graph name and period (comment lines are allowed)
    const lines = text.trim().split("\n");
    for (const line of lines) {
      if (line.trim() && !line.startsWith("#")) {
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

Deno.test("export trailer counts files that still carry http:// plazi subjects", async () => {
  const testDir = await Deno.makeTempDir();
  const testGraphUriPrefix = "https://treatment.plazi.org/id";

  try {
    // regenerated since gg2rdf#33: subject and graph agree
    await Deno.writeTextFile(
      `${testDir}/AAAA.nt`,
      '<https://treatment.plazi.org/id/AAAA> <http://example.org/p> "o" .\n',
    );
    // written before gg2rdf#33: http:// subject in an https:// graph
    await Deno.writeTextFile(
      `${testDir}/BBBB.nt`,
      '<http://treatment.plazi.org/id/BBBB> <http://example.org/p> "o" .\n' +
      '<http://taxon-name.plazi.org/id/Animalia/Genus> <http://example.org/p> "o" .\n',
    );
    // foreign http:// subjects are not plazi's and do not count
    await Deno.writeTextFile(
      `${testDir}/CCCC.nt`,
      '<http://example.org/s> <http://example.org/p> "o" .\n',
    );

    const request = new Request("http://localhost:4505/nquads");
    const response = await handleNQuadsEndpoint(request, testDir, testGraphUriPrefix);
    const text = await response.text();

    const trailer = text.trim().split("\n").at(-1)!;
    assertEquals(trailer.startsWith("# export complete: 3 files"), true, trailer);
    assertEquals(trailer.includes("1 files still with http:// plazi subjects"), true, trailer);
    // the data itself is passed through untouched
    assertEquals(text.includes("<http://treatment.plazi.org/id/BBBB>"), true);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("export trailer is silent when no file carries http:// plazi subjects", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${testDir}/AAAA.nt`,
      '<https://treatment.plazi.org/id/AAAA> <http://example.org/p> "o" .\n',
    );
    const response = await handleNTriplesEndpoint(new Request("http://localhost:4505/ntriples"), testDir);
    const trailer = (await response.text()).trim().split("\n").at(-1)!;
    assertEquals(trailer.includes("http:// plazi subjects"), false, trailer);
  } finally {
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
    
    // Should contain nothing but the start/end comment lines
    const dataLines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    assertEquals(dataLines, []);
    assertEquals(text.includes("# export complete: 0 files, 0 unique triples"), true);
  } finally {
    // Cleanup
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNQuadsEndpoint - first chunk is sent before any file is read", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${testDir}/test1.nt`,
      '<http://example.org/s1> <http://example.org/p1> "o1" .\n'
    );
    const response = handleNQuadsEndpoint(new Request("http://localhost:4505/nquads"), testDir, "https://treatment.plazi.org/id");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    // The first chunk is a comment line, so callers get a first byte immediately
    const first = decoder.decode((await reader.read()).value);
    assertEquals(first.startsWith("# turtle-hook-nq N-Quads export started "), true, first);
    assertEquals(first.endsWith("\n"), true);
    assertEquals(first.includes("example.org"), false);

    // Then the data, then the completion marker
    let rest = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    const lines = rest.trim().split("\n");
    assertEquals(lines[0], '<http://example.org/s1> <http://example.org/p1> "o1" <https://treatment.plazi.org/id/test1> .');
    assertEquals(lines[lines.length - 1].startsWith("# export complete: 1 files, 1 unique triples"), true, lines[lines.length - 1]);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNTriplesEndpoint - emits heartbeat comments when only duplicates are found", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    const content = '<http://example.org/s1> <http://example.org/p1> "o1" .\n';
    // a.nt is read first; b.nt and c.nt only contain duplicates and produce no data
    await Deno.writeTextFile(`${testDir}/a.nt`, content);
    await Deno.writeTextFile(`${testDir}/b.nt`, content);
    await Deno.writeTextFile(`${testDir}/c.nt`, content);

    const response = handleNTriplesEndpoint(
      new Request("http://localhost:4505/ntriples"),
      testDir,
      { maxFlushIntervalMs: 0, heartbeatIntervalMs: 0 },
    );
    const text = await response.text();
    const lines = text.trim().split("\n");
    assertEquals(lines.filter((l) => !l.startsWith("#")), [content.trim()]);
    assertEquals(lines.filter((l) => l.startsWith("# still working: ")).length >= 1, true, text);
    assertEquals(lines[lines.length - 1].startsWith("# export complete: 3 files, 1 unique triples"), true);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("streaming - a stall in the middle of a file still produces heartbeats", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    // One single small file: no file boundary and no line-count checkpoint can
    // rescue the timing here, only a timer can.
    await Deno.writeTextFile(
      `${testDir}/slow.nt`,
      '<http://example.org/s1> <http://example.org/p1> "o1" .\n'
    );
    const openFile = Deno.open;
    const stall = Promise.withResolvers<void>();
    let stalled = false;
    // Stall the read of the file itself, after the walk has found it.
    Deno.open = async (path, opts) => {
      stalled = true;
      await stall.promise;
      return await openFile(path, opts);
    };

    try {
      const response = handleNTriplesEndpoint(
        new Request("http://localhost:4505/ntriples"),
        testDir,
        { maxFlushIntervalMs: 10, heartbeatIntervalMs: 10 },
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      assertEquals(
        decoder.decode((await reader.read()).value).startsWith("# turtle-hook-nq "),
        true,
      );

      // While the read is stuck the client keeps hearing from us.
      const heartbeat = decoder.decode((await reader.read()).value);
      assertEquals(stalled, true);
      assertEquals(heartbeat.startsWith("# still working: "), true, heartbeat);

      stall.resolve();
      let rest = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += decoder.decode(value);
      }
      assertEquals(rest.includes('<http://example.org/s1>'), true, rest);
      assertEquals(rest.includes("# export complete: 1 files, 1 unique triples"), true, rest);
    } finally {
      Deno.open = openFile;
    }
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});
