import { GHActWorker, type Job } from "./deps.ts";
import { ghActConfig, nqConfig } from "../config/config.ts";
import { existsSync } from "https://deno.land/x/ghact@1.2.6/src/deps.ts";
import removeQuads from "./removeQuads.ts";


const graphUri = (fileName: string) =>
  `<${nqConfig.graphUriPrefix}/${
    fileName.replace(/.*\//, "").replace(/\.ttl$/, "")
  }>`;

const _worker = new GHActWorker(
  self,
  ghActConfig,
  async (job: Job, log): Promise<string> => {
    log(
      "Starting transformation\n" + JSON.stringify(job, undefined, 2),
    );
    console.log("working!!!!!");
    let added: string[] = [];
    let modified: string[] = [];
    let removed: string[] = [];

    if ("files" in job) {
      modified = job.files.modified ?? [];
      if ("added" in job.files) added = job.files.added;
      if ("removed" in job.files) removed = job.files.removed;
    } else if (job.from) {
      const files = await _worker.gitRepository.getModifiedAfter(
        job.from,
        job.till,
        log,
      );
      added = files.added;
      modified = files.modified;
      removed = files.removed;
      job.from = files.from;
      job.till = files.till;
    } else {
      throw new Error(
        "Could not start job, neither explicit file list nor from-commit specified",
      );
    }

    added = added.filter((f) => f.endsWith(".ttl"));
    removed = removed.filter((f) => f.endsWith(".ttl"));
    modified = modified.filter((f) => f.endsWith(".ttl"));

    // modified implemented as removed and added
    removed.push(...modified)
    added.push(...modified)
    if (existsSync(nqConfig.outputFile)) {
      await removeQuads(nqConfig.outputFile, ...removed.map(file => graphUri(file)));
    }
    const results = await Promise.all(
      added.map(async (file) => {
        const fullFile = `${_worker.gitRepository.directory}/${file}`;
        if (!file.endsWith(".ttl") || !existsSync(fullFile)) {
          return { file, success: true }; // Skip non-ttl or non-existent files
        }
        
        try {
          const command = new Deno.Command("rapper", {
            args: ["-i", "turtle", fullFile, "-o", "nquads"],
            stdin: "piped",
            stdout: "piped",
          });
          const child = command.spawn();
          
          // Use a temporary file per process to avoid conflicts
          const tempFile = `${nqConfig.outputFile}.${file.replace(/\//g, '_')}.tmp`;
          const outputFileHandle = await Deno.open(tempFile, { write: true, create: true, append: false });
          
          child.stdout
            .pipeThrough(replacePeriodAtEnd(` ${graphUri(file)} .`))
            .pipeTo(outputFileHandle.writable);
          
          child.stdin.close();
          const status = await child.status;
          
          if (!status.success) {
            await Deno.remove(tempFile).catch(() => {});
            throw new Error(`Status: ${status.code}`);
          }
          
          return { file, success: true, tempFile };
        } catch (error) {
          log(` » error in ${file}: ${error}`);
          return { file, success: false, error };
        }
      })
    );

    // Merge temp files into main output file
    const outputFileHandle = await Deno.open(nqConfig.outputFile, { write: true, create: true, append: true });
    for (const result of results) {
      if (result.success && result.tempFile) {
        const tempContent = await Deno.readFile(result.tempFile);
        await outputFileHandle.write(tempContent);
        await Deno.remove(result.tempFile);
      }
    }
    outputFileHandle.close();

    const failingFiles = results.filter(r => !r.success).map(r => r.file);
    const succeededOnce = results.some(r => r.success);

    log("< done");
    if (!succeededOnce) {
      log(`All failed:\n ${failingFiles.join("\n ")}`);
      throw new Error(`All failed`);
    } else if (failingFiles.length > 0) {
      log(`Some failed:\n ${failingFiles.join("\n ")}`);
      return `Some failed: ${failingFiles.length} of ${modified.length} failed`;
    } else {
      log("All succeeded");
      return "";
    }
  },
);

function replacePeriodAtEnd(s: string) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let leftover = "";

  return new TransformStream({
      transform(chunk, controller) {
          // Decode the chunk and prepend leftover from previous call
          const text : string = leftover + decoder.decode(chunk, { stream: true }) as string;

          // Split into lines, keeping the last part as a possible leftover
          const lines: string[] = text.split(/\r?\n/);
          leftover = lines.pop() || ""; // Save the last (possibly incomplete) line

          for (let line of lines) {
              // Replace period at end of the line with 's'
              line = line.replace(/\.$/, s);
              controller.enqueue(encoder.encode(line + "\n"));
          }
      },
      flush(controller) {
          if (leftover) {
              // Replace period at end of last line if it exists
              leftover = leftover.replace(/\.$/, s);
              controller.enqueue(encoder.encode(leftover));
          }
      }
  });
}
