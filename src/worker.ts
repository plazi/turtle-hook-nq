import { GHActWorker, type Job } from "./deps.ts";
import { ghActConfig, nqConfig } from "../config/config.ts";
import { existsSync } from "https://deno.land/x/ghact@1.2.6/src/deps.ts";
import { graphUri } from "./utils.ts";

// Helper function to get the output .nt file path for a given .ttl file
const getNTriplesPath = (ttlFile: string): string => {
  const relativePath = ttlFile.replace(/\.ttl$/, ".nt");
  return `${nqConfig.ntriplesDir}/${relativePath}`;
};

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

    // Ensure ntriples directory exists
    if (!existsSync(nqConfig.ntriplesDir)) {
      await Deno.mkdir(nqConfig.ntriplesDir, { recursive: true });
    }

    // Remove .nt files for removed turtle files
    for (const file of removed) {
      const ntPath = getNTriplesPath(file);
      if (existsSync(ntPath)) {
        await Deno.remove(ntPath);
        log(` » removed ${ntPath}`);
      }
    }

    // modified implemented as removed and added
    added.push(...modified);
    
    const results = await Promise.all(
      added.map(async (file) => {
        const fullFile = `${_worker.gitRepository.directory}/${file}`;
        if (!existsSync(fullFile)) {
          return { file, success: true }; // Skip non-existent files
        }
        
        try {
          const command = new Deno.Command("rapper", {
            args: ["-i", "turtle", fullFile, "-o", "ntriples"],
            stdin: "piped",
            stdout: "piped",
          });
          const child = command.spawn();
          
          // Create output directory if needed
          const ntPath = getNTriplesPath(file);
          const ntDir = ntPath.substring(0, ntPath.lastIndexOf('/'));
          if (!existsSync(ntDir)) {
            await Deno.mkdir(ntDir, { recursive: true });
          }
          
          // Write output to individual .nt file
          const outputFileHandle = await Deno.open(ntPath, { write: true, create: true, truncate: true });
          
          child.stdout.pipeTo(outputFileHandle.writable);
          
          child.stdin.close();
          const status = await child.status;
          
          if (!status.success) {
            throw new Error(`Status: ${status.code}`);
          }
          
          log(` » converted ${file} to ${ntPath}`);
          return { file, success: true };
        } catch (error) {
          log(` » error in ${file}: ${error}`);
          return { file, success: false, error };
        }
      })
    );

    const failingFiles = results.filter(r => !r.success).map(r => r.file);
    const succeededOnce = results.some(r => r.success);

    log("< done");
    if (!succeededOnce) {
      log(`All failed:\n ${failingFiles.join("\n ")}`);
      throw new Error(`All failed`);
    } else if (failingFiles.length > 0) {
      log(`Some failed:\n ${failingFiles.join("\n ")}`);
      return `Some failed: ${failingFiles.length} of ${added.length} failed`;
    } else {
      log("All succeeded");
      return "";
    }
  },
);
