import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatImage } from "../src/output.ts";

describe("formatImage", () => {
  it("prints the bare public URL by default", () => {
    const line = formatImage(
      { publicUrl: "https://img.example.com/aaa.png", sourceName: "before.png" },
      { markdown: false },
    );

    assert.equal(line, "https://img.example.com/aaa.png");
  });

  it("prints nothing but the URL, so it survives command substitution", () => {
    const line = formatImage({ publicUrl: "https://img.example.com/aaa.png" }, { markdown: false });

    assert.equal(line, "https://img.example.com/aaa.png");
    assert.ok(!line.includes("\n"));
  });

  it("uses the source file's name as alt text in markdown", () => {
    const line = formatImage(
      { publicUrl: "https://img.example.com/aaa.png", sourceName: "login-screen.png" },
      { markdown: true },
    );

    assert.equal(line, "![login-screen](https://img.example.com/aaa.png)");
  });

  it("leaves alt text empty for an image read from stdin", () => {
    const line = formatImage({ publicUrl: "https://img.example.com/aaa.png" }, { markdown: true });

    assert.equal(line, "![](https://img.example.com/aaa.png)");
  });

  it("escapes a source name that would otherwise break the markdown", () => {
    const line = formatImage(
      { publicUrl: "https://img.example.com/aaa.png", sourceName: "before [and] after.png" },
      { markdown: true },
    );

    assert.equal(line, "![before \\[and\\] after](https://img.example.com/aaa.png)");
  });
});
