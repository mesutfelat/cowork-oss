import { describe, expect, it } from "vitest";
import { renderVisualAnnotatorHtml } from "../visual-tools";

describe("renderVisualAnnotatorHtml", () => {
  it("includes the coworkCanvas bridge and bootstrap JSON", () => {
    const html = renderVisualAnnotatorHtml({
      version: 1,
      sessionId: "sess",
      title: "t",
      imageFilename: "image.png",
    });

    expect(html).toContain("window.coworkCanvas");
    expect(html).toContain('type="application/json"');
    expect(html).toContain('"sessionId":"sess"');
    expect(html).toContain('"imageFilename":"image.png"');
  });

  it("escapes < in embedded JSON to prevent script injection", () => {
    const html = renderVisualAnnotatorHtml({
      version: 1,
      sessionId: "sess",
      title: "</script><img src=x onerror=alert(1)>",
      imageFilename: "image.png",
      instructions: "<b>hi</b>",
    });

    // The JSON payload should not contain raw "<" characters.
    const bootstrapStart = html.indexOf('<script id="bootstrap" type="application/json">');
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    const bootstrapEnd = html.indexOf("</script>", bootstrapStart + 1);
    expect(bootstrapEnd).toBeGreaterThan(bootstrapStart);
    const jsonChunk = html.slice(bootstrapStart, bootstrapEnd);
    expect(jsonChunk).not.toContain("<b>");
    expect(jsonChunk).not.toContain("</script><img");
    expect(jsonChunk).toContain("\\u003c");
  });
});
