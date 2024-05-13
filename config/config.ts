import { type Config } from "../src/deps.ts";

export const sparqlConfig = {
  graphUriPrefix: "https://raw.githubusercontent.com/plazi/treatments-rdf/main",
  uploadUri: "http://blazegraph:8080/blazegraph/sparql",
};

export const ghActConfig: Config = {
  title: "Turle-Hook",
  description: "Load RDF fron plazi/treatments-rdf into out triple-store.",
  // we don't create commits, so a default job-author is not really neccesary
  email: "",
  sourceRepositoryUri: "https://github.com/plazi/treatments-rdf.git",
  sourceBranch: "main",
  sourceRepository: "plazi/treatments-rdf",
  workDir: "/workdir",
};
