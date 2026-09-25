import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNQuadsEndpoint, handleNTriplesEndpoint, latestCompletedTill } from "./endpoints.ts";
import { createHash } from "./deps.ts";

/** Splits an export into the lines before the `# END` sentinel and the sentinel's fields. */
function parseExport(text: string) {
  assertEquals(text.endsWith("\n"), true);
  const endStart = text.lastIndexOf("\n", text.length - 2) + 1;
  const body = text.slice(0, endStart);
  const m = text.slice(endStart).match(/^# END till=(\S+) lines=(\d+) sha256=([0-9a-f]{64})\n$/);
  assertEquals(m !== null, true, text.slice(endStart));
  return { body, till: m![1], lines: Number(m![2]), sha256: m![3] };
}

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
    assertEquals(text.includes("# export complete: 0 files, 0 triples"), true);
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
    assertEquals(lines[lines.length - 2].startsWith("# export complete: 1 files, 1 triples"), true, lines[lines.length - 2]);
    assertEquals(lines[lines.length - 1].startsWith("# END till="), true, lines[lines.length - 1]);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNTriplesEndpoint - emits heartbeat comments when files produce no data", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    const content = '<http://example.org/s1> <http://example.org/p1> "o1" .\n';
    // a.nt is read first; b.nt only repeats its own triple, c.nt is empty
    await Deno.writeTextFile(`${testDir}/a.nt`, content);
    await Deno.writeTextFile(`${testDir}/b.nt`, "");
    await Deno.writeTextFile(`${testDir}/c.nt`, "\n");

    const response = handleNTriplesEndpoint(
      new Request("http://localhost:4505/ntriples"),
      testDir,
      { maxFlushIntervalMs: 0, heartbeatIntervalMs: 0 },
    );
    const text = await response.text();
    const lines = text.trim().split("\n");
    assertEquals(lines.filter((l) => !l.startsWith("#")), [content.trim()]);
    assertEquals(lines.filter((l) => l.startsWith("# still working: ")).length >= 1, true, text);
    assertEquals(lines[lines.length - 2].startsWith("# export complete: 3 files, 1 triples"), true);
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
      assertEquals(rest.includes("# export complete: 1 files, 1 triples"), true, rest);
    } finally {
      Deno.open = openFile;
    }
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNQuadsEndpoint - duplicates are removed within a file but kept across graphs", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    const triple = '<http://example.org/s> <http://example.org/p> "o" .\n';
    await Deno.writeTextFile(`${testDir}/A.nt`, triple + triple);
    await Deno.writeTextFile(`${testDir}/B.nt`, triple);
    const text = await handleNQuadsEndpoint(
      new Request("http://localhost:4505/nquads"),
      testDir,
      "https://treatment.plazi.org/id",
    ).text();
    const data = text.split("\n").filter((l) => l && !l.startsWith("#")).sort();
    assertEquals(data, [
      '<http://example.org/s> <http://example.org/p> "o" <https://treatment.plazi.org/id/A> .',
      '<http://example.org/s> <http://example.org/p> "o" <https://treatment.plazi.org/id/B> .',
    ]);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("handleNQuadsEndpoint - ends with a sentinel that verifies the export", async () => {
  const testDir = await Deno.makeTempDir();
  const jobsDir = await Deno.makeTempDir();
  try {
    for (let i = 0; i < 50; i++) {
      await Deno.writeTextFile(
        `${testDir}/t${i}.nt`,
        `<http://example.org/s${i}> <http://example.org/p> "o${i}" .\n`,
      );
    }
    const job = (id: string, till: string, status: string) =>
      Deno.mkdir(`${jobsDir}/${id}`).then(() =>
        Deno.writeTextFile(
          `${jobsDir}/${id}/status.json`,
          JSON.stringify({ job: { id, till }, status }),
        )
      );
    await job("2026-09-24T10:00:00.000Z", "aaa", "completed");
    await job("2026-09-25T10:00:00.000Z", "bbb", "completed");
    await job("2026-09-25T11:00:00.000Z", "ccc", "failed");
    await job("2026-09-25T12:00:00.000Z", "ddd", "running");

    const text = await handleNQuadsEndpoint(
      new Request("http://localhost:4505/nquads"),
      testDir,
      "https://treatment.plazi.org/id",
      { jobsDir, flushLineCount: 7 },
    ).text();
    const { body, till, lines, sha256 } = parseExport(text);
    assertEquals(till, "bbb");
    assertEquals(lines, body.split("\n").length - 1);
    assertEquals(sha256, createHash("sha256").update(body).digest("hex"));
    assertEquals(body.split("\n").filter((l) => l && !l.startsWith("#")).length, 50);
  } finally {
    await Deno.remove(testDir, { recursive: true });
    await Deno.remove(jobsDir, { recursive: true });
  }
});

Deno.test("latestCompletedTill - missing job directory", async () => {
  assertEquals(await latestCompletedTill("/nonexistent/jobs"), undefined);
});

Deno.test("streaming - an export that fails has no sentinel", async () => {
  const testDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${testDir}/a.nt`, '<http://example.org/s> <http://example.org/p> "o" .\n');
    await Deno.writeTextFile(`${testDir}/b.nt`, '<http://example.org/s> <http://example.org/p> "o" .\n');
    const openFile = Deno.open;
    let opened = 0;
    Deno.open = async (path, opts) => {
      if (++opened === 2) throw new Error("disk on fire");
      return await openFile(path, opts);
    };
    const consoleError = console.error;
    console.error = () => {};
    try {
      const reader = handleNQuadsEndpoint(
        new Request("http://localhost:4505/nquads"),
        testDir,
        "https://treatment.plazi.org/id",
      ).body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let failed = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value);
        }
      } catch (_e) {
        failed = true;
      }
      assertEquals(failed, true);
      assertEquals(text.includes("# END"), false, text);
    } finally {
      Deno.open = openFile;
      console.error = consoleError;
    }
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});
