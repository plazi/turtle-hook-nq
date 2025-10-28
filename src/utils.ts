import { nqConfig } from "../config/config.ts";

/**
 * Generate a graph URI from a turtle filename
 * Preserves directory structure in the graph name
 */
export const graphUri = (fileName: string) =>
  `<${nqConfig.graphUriPrefix}/${
    fileName.replace(/\.ttl$/, "")
  }>`;
