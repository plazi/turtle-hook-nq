# Turtle-Hook-nq

This updates an nq-file to reflect the changes of the content of RDF-Turtle files in a git (gittea) repository.

It uses [ghact](https://deno.land/x/ghact) to provide a webhook and a web/rest interface.

## Testing

Run unit tests:
```bash
deno test --allow-read --allow-write src/removeQuads.test.ts
```
