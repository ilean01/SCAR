import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("all offline assets and their static imports exist", () => {
  const root = new URL("../", import.meta.url);
  const sw = readFileSync(new URL("sw.js", root), "utf8");
  const files = [...sw.matchAll(/"\.\/([^"\n]+)"/g)].map(m => m[1]);
  for (const path of files) {
    const url = new URL(path, root);
    assert.ok(existsSync(url), `Missing offline asset: ${path}`);
    if (!path.endsWith(".js")) continue;
    const source = readFileSync(url, "utf8");
    for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      assert.ok(existsSync(new URL(match[1], url)), `Missing import in ${path}: ${match[1]}`);
    }
  }
});
