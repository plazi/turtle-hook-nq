# Turtle-Hook-nq

This service maintains a local file structure with n-triples files corresponding to RDF-Turtle files in a git (gitea) repository. When turtle files change via webhooks, the corresponding n-triples files are automatically updated.

It uses [ghact](https://deno.land/x/ghact) to provide webhook handling and a web/rest interface.

## Architecture

When turtle files are added, modified, or removed via git webhooks:
- Individual `.nt` (n-triples) files are generated/updated using `rapper`
- Files are organized in a directory structure matching the original turtle files
- The service maintains a 1:1 correspondence between `.ttl` and `.nt` files

## Endpoints

### `/nquads`
Returns all data as N-Quads by concatenating the n-triples files and adding graph names based on file paths.
- **Content-Type**: `application/n-quads`
- **Graph names**: Derived from the relative file path (e.g., `file.ttl` → `<https://treatment.plazi.org/id/file>`)

### `/ntriples`
Returns all data as N-Triples by concatenating the n-triples files without graph names.
- **Content-Type**: `application/n-triples`
- **Note**: May contain duplicate triples. Clients can deduplicate using `sort` and `uniq` commands.

## Configuration

Configuration is managed in `config/config.ts`:
- `graphUriPrefix`: Base URI for graph names
- `ntriplesDir`: Directory where n-triples files are stored (default: `/workdir/ntriples`)

## Testing

Run all tests:
```bash
deno test --allow-read --allow-write --allow-env --allow-run=rapper src/
```

Run specific test suites:
```bash
# Endpoint tests
deno test --allow-read --allow-write --allow-env src/endpoints.test.ts

# Integration tests
deno test --allow-read --allow-write --allow-env --allow-run=rapper src/integration.test.ts

# RemoveQuads utility tests
deno test --allow-read --allow-write src/removeQuads.test.ts
```

## Running

```bash
deno run --allow-net --allow-read --allow-write --allow-run=git,rapper --allow-env src/main.ts
```

The service runs on port 4505 by default (configurable via the `PORT` environment variable).
