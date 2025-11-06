# Turtle-Hook-nq

This updates an nq-file to reflect the changes of the content of RDF-Turtle files in a git (gittea) repository.

It uses [ghact](https://deno.land/x/ghact) to provide a webhook and a web/rest interface.

## Web Endpoints

The server provides the following web endpoints:

- `/nquads` - Returns all RDF data as N-Quads format by concatenating individual n-triples files and adding graph names (determined by the filename)
- `/ntriples` - Returns all RDF data as N-Triples format by concatenating individual n-triples files

Both endpoints stream data directly from disk (line-by-line for `/nquads`) to keep memory usage low even for very large datasets.

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
