import { GHActWorker, type Job, existsSync, join, dirname } from "./deps.ts";
import { ghActConfig, nqConfig } from "../config/config.ts";

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
    
    // Ensure ntriples directory exists
    await Deno.mkdir(nqConfig.ntriplesDir, { recursive: true });
    
    // Remove n-triples files for removed turtle files
    for (const file of removed) {
      const ntFile = join(nqConfig.ntriplesDir, file.replace(/\.ttl$/, ".nt"));
      try {
        if (existsSync(ntFile)) {
          await Deno.remove(ntFile);
        }
      } catch (error) {
        log(` » error removing ${ntFile}: ${error}`);
      }
    }
    
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
          
          // Create output file path maintaining directory structure
          const ntFile = join(nqConfig.ntriplesDir, file.replace(/\.ttl$/, ".nt"));
          const ntDir = dirname(ntFile);
          
          // Ensure directory exists
          await Deno.mkdir(ntDir, { recursive: true });
          
          const outputFileHandle = await Deno.open(ntFile, { write: true, create: true, truncate: true });
          
          child.stdout.pipeTo(outputFileHandle.writable);
          
          child.stdin.close();
          const status = await child.status;
          
          if (!status.success) {
            throw new Error(`Status: ${status.code}`);
          }
          
          return { file, success: true, ntFile };
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
      return `Some failed: ${failingFiles.length} of ${modified.length} failed`;
    } else {
      log("All succeeded");
      return "";
    }
  },
);
