# Turtle-Hook-nq

This updates an nq-file to reflect the changes of the content of RDF-Turtle files in a git (gittea) repository.

It uses [ghact](https://deno.land/x/ghact) to provide a webhook and a web/rest interface.

## Web Endpoints

The server provides the following web endpoints:

- `/nquads` - Returns all RDF data as N-Quads format by concatenating individual n-triples files and adding graph names (determined by the filename)
- `/ntriples` - Returns all RDF data as N-Triples format by concatenating individual n-triples files

Both endpoints stream data directly from disk (line-by-line for `/nquads`) to keep memory usage low even for very large datasets.

Because a full export walks every n-triples file, a complete response takes several minutes for a large dataset. To let callers tell "still working" from "hung", the response is not silent while this happens:

- the first line, sent immediately, is a comment (`# turtle-hook-nq N-Quads export started <timestamp>`),
- pending data is flushed at least every few seconds, and if nothing could be sent for a while a comment line `# still working: ...` is emitted,
- then `# export complete: <n> files, <m> triples, took <s>s`,
- and the very last line is the sentinel `# END till=<commit> lines=<n> sha256=<hex>`.

Comment lines are part of the N-Triples/N-Quads grammar and are ignored by RDF parsers.

### Verifying a download

The response status is sent before the export runs, so a failed or cut-off export still looks like a successful HTTP 200. Only a complete export ends with the `# END` line: `till` is the commit of the newest completed job when the export started, `lines` the number of lines before the sentinel and `sha256` the hash of all bytes before it. Check all of it before using a download:

```bash
curl -fsS https://hooknq.ld.plazi.org/nquads -o data.nq
end=$(tail -n 1 data.nq)
[[ $end =~ ^#\ END\ till=([0-9a-f]+|unknown)\ lines=([0-9]+)\ sha256=([0-9a-f]{64})$ ]] || { echo "truncated"; exit 1; }
[ "$(head -n -1 data.nq | wc -l)" = "${BASH_REMATCH[2]}" ] || { echo "line count mismatch"; exit 1; }
[ "$(head -n -1 data.nq | sha256sum | cut -d' ' -f1)" = "${BASH_REMATCH[3]}" ] || { echo "hash mismatch"; exit 1; }
```

Duplicate triples are removed within a file only. Across files they are kept: in N-Quads they belong to different graphs (one per treatment), and stores deduplicate on load anyway. (A global set of seen triples used to cut every export off after 2^24 = 16,777,216 triples, the maximum size of a JavaScript `Set`.)

## File Structure

Rather than maintaining a single consolidated n-quads file, the system now keeps individual n-triples files matching the turtle file structure. When turtle files are added, modified, or removed, the corresponding n-triples files are updated in the `/workdir/ntriples` directory.

## Testing

Run all unit tests:
```bash
deno test --allow-read --allow-write
```

Run specific test files:
```bash
deno test --allow-read --allow-write src/endpoints.test.ts
```
