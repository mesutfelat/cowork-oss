import { describe, it, expect } from "vitest";

import { createLocalEmbedding, cosineSimilarity } from "../local-embedding";

describe("local-embedding", () => {
  it("produces deterministic fixed-size vectors", () => {
    const a = createLocalEmbedding("PMNL Portuguese support for Enes");
    const b = createLocalEmbedding("PMNL Portuguese support for Enes");
    expect(a).toHaveLength(256);
    expect(b).toHaveLength(256);
    expect(a).toEqual(b);
  });

  it("gives high similarity for identical text and low for unrelated text", () => {
    const a = createLocalEmbedding("PMNL Portuguese language support");
    const b = createLocalEmbedding("PMNL Portuguese language support");
    const c = createLocalEmbedding("Kubernetes ingress controller deployment");

    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.9);
    expect(cosineSimilarity(a, c)).toBeLessThan(0.4);
  });
});
