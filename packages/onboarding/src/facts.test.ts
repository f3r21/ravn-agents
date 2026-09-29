import { describe, expect, it } from "vitest";
import { collectFacts, htmlEntryScripts, readPackageJson, renderFacts, scanExports } from "./facts.js";

describe("scanExports", () => {
  it("finds declarations with their line numbers and skips re-exports", () => {
    const source = [
      "import x from 'y'",
      "export const routes = []",
      "export async function load() {}",
      "export type Props = {}",
      "export default defineConfig({})",
      "export { a } from './a'",
      "export default function App() {}",
    ].join("\n");
    expect(scanExports("src/r.ts", source)).toEqual([
      { name: "routes", kind: "const", path: "src/r.ts", line: 2 },
      { name: "load", kind: "function", path: "src/r.ts", line: 3 },
      { name: "Props", kind: "type", path: "src/r.ts", line: 4 },
      { name: "default", kind: "default", path: "src/r.ts", line: 5 },
      { name: "App", kind: "function", path: "src/r.ts", line: 7 },
    ]);
  });
});

describe("readPackageJson", () => {
  const source = `{
  "name": "app",
  "main": "dist/index.js",
  "scripts": {
    "test": "vitest run",
    "gate": "npm run test"
  },
  "dependencies": { "react": "^19.0.0" },
  "devDependencies": { "vitest": "^3.0.0" }
}
`;

  it("reads scripts with the line each is declared on", () => {
    const facts = readPackageJson("package.json", source);
    expect(facts?.scripts).toEqual({ test: "vitest run", gate: "npm run test" });
    expect(facts?.scriptLines).toEqual({ test: 5, gate: 6 });
    expect(facts?.dependencies).toEqual({ react: "^19.0.0" });
    expect(facts?.devDependencies).toEqual(["vitest"]);
    expect(facts?.entryPoints).toEqual(["main: dist/index.js"]);
  });

  it("returns undefined for invalid JSON instead of throwing", () => {
    expect(readPackageJson("package.json", "{ nope")).toBeUndefined();
  });
});

describe("htmlEntryScripts", () => {
  it("reads module script sources", () => {
    expect(htmlEntryScripts('<script type="module" src="/src/main.tsx"></script>')).toEqual(["/src/main.tsx"]);
  });
});

describe("collectFacts and renderFacts", () => {
  const files: Record<string, string> = {
    "src/main.tsx": "export const x = 1\n",
    "src/a.test.ts": "export const y = 2\n",
    "index.html": '<script type="module" src="/src/main.tsx"></script>',
  };

  it("skips tests for exports, finds entry points and states the cut when a list is truncated", () => {
    const facts = collectFacts(Object.keys(files), (p) => files[p]);
    expect(facts.testFiles).toEqual(["src/a.test.ts"]);
    expect(facts.exports.map((e) => e.name)).toEqual(["x"]);
    expect(facts.entryPoints).toEqual(["index.html -> /src/main.tsx", "src/main.tsx"]);
    const text = renderFacts(facts, { maxFiles: 1, maxExports: 60 });
    expect(text).toContain("### Files (3 total, 1 tests)");
    expect(text).toContain("(+1 more, not listed)");
    expect(text).toContain("`x` (const) `src/main.tsx:1`");
  });
});
