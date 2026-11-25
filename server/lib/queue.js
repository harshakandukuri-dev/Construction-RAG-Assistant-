import PQueue from "p-queue";

// Local LLM inference is the bottleneck, so only a few answers are generated at
// once. Extra questions wait in line instead of failing or timing out.
export const queue = new PQueue({
  concurrency: Number(process.env.RAG_CONCURRENCY) || 2,
});
