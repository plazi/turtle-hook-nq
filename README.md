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
- the last line is `# export complete: <n> files, <m> unique triples, took <s>s`, so a truncated download can be recognized.

Comment lines are part of the N-Triples/N-Quads grammar and are ignored by RDF parsers. Duplicate triples (identical lines in several files) are emitted only once.

## Graph names and subject IRIs

The graph a treatment's triples are placed in is named after the file,
`https://treatment.plazi.org/id/<treatment-id>` (`graphUriPrefix` in
`config/config.ts`). Since [plazi/gg2rdf#33] the treatment subject inside the
file is the very same IRI, so `GRAPH ?g { ?g ?p ?o }` joins a treatment to its
own provenance graph. The prefix is not a deployment setting and must not be
changed: it has to match what gg2rdf writes, and removing a previous version of
a file depends on it staying stable.

[plazi/gg2rdf#33]: https://github.com/plazi/gg2rdf/issues/33

Files generated before that change carry `http://` subjects and still load — into
a graph whose name differs from the subject by scheme. Nothing here rewrites
them: the n-triples are the source of truth for the QLever index, so they are
fixed at the source, by regenerating them with gg2rdf. Until that has happened
for every file, the `# export complete:` trailer of `/nquads` and `/ntriples`
reports how many files still carry `http://` Plazi subjects, and the QLever
index needs a full rebuild from the export once they are gone.

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
