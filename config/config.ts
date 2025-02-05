import { type Config } from "../src/deps.ts";

export const nqConfig = {
  graphUriPrefix: "https://treatment.plazi.org/id",
  outputFile: "/workdir/plazi-treatments.nq",
};

export const ghActConfig: Config = {
  title: "Turtle-Hook-nq",
  description: "Updates an nq-file with the RDF data from a git repository.",
  // we don't create commits, so a default job-author is not really neccesary
  email: "",
  sourceRepositoryUri: "https://git.ld.plazi.org/plazi/treatments-rdf.git",
  sourceBranch: "main",
  sourceRepository: "plazi/treatments-rdf",
  workDir: "/workdir",
};
