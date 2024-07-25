import { type Config } from "../src/deps.ts";

export const sparqlConfig = {
  // do not change this prefix, removing the previous version depends on this not changing
  graphUriPrefix: "https://treatment.plazi.org/id",
  uploadUri: "http://blazegraph:8080/blazegraph/sparql",
};

export const ghActConfig: Config = {
  title: "Turtle-Hook",
  description: "Load RDF from plazi/treatments-rdf into our triple-store.",
  // we don't create commits, so a default job-author is not really neccesary
  email: "",
  sourceRepositoryUri: "https://git.ld.plazi.org/plazi/treatments-rdf.git",
  sourceBranch: "main",
  sourceRepository: "plazi/treatments-rdf",
  workDir: "/workdir",
};
