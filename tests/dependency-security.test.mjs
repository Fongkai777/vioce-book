import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = createRequire(import.meta.url);
function resolveChain(chain) {
  let require = root;
  for (const pkg of chain) {
    require = createRequire(pkg === "vinext" ? import.meta.resolve(pkg) : require.resolve(pkg));
  }
  return require;
}
const nextRequire = resolveChain(["eslint-config-next", "@next/eslint-plugin-next"]);
const dynamicRequire = resolveChain(["vinext", "vite-plugin-commonjs", "vite-plugin-dynamic-import"]);

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "voicebook-glob-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ["apps/web/app/page.tsx", "apps/admin/app/page.tsx", "apps/readme.md",
    "modules/one.js", "modules/two.ts", "modules/nested/index.js", "modules/.hidden.js",
    "modules/ignored.txt", "entry.js"]) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "export default 1;\n");
  }
  return dir;
}

test("the locked graph removes braces, micromatch and fast-glob without audit exceptions", () => {
  const lock = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");
  // Ignore scoped removal overrides; reject actual package/snapshot entries.
  assert.doesNotMatch(lock, /^  (?:braces|micromatch|fast-glob)@/m);
  const workspace = readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /auditConfig|ignoreCves|ignoreGhsas/);
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts["audit:reviewed"], "pnpm audit");
  for (const require of [nextRequire, dynamicRequire]) {
    assert.equal(require("tinyglobby/package.json").version, "0.2.17");
    for (const removed of ["braces", "micromatch", "fast-glob"]) {
      assert.throws(() => require.resolve(removed), { code: "MODULE_NOT_FOUND" });
    }
  }
});

test("ESLint's actual root resolver preserves literal, glob, brace and array settings", t => {
  const dir = fixture(t);
  const { getRootDirs } = nextRequire("./utils/get-root-dirs.js");
  const web = path.join(dir, "apps/web");
  const admin = path.join(dir, "apps/admin");
  const roots = rootDir => getRootDirs({ cwd: dir, settings: { next: { rootDir } } }).sort();
  assert.deepEqual(roots(undefined), [dir]);
  assert.deepEqual(roots(web), [web]); // Must not recursively return app/.
  assert.deepEqual(roots(path.join(dir, "apps/*")), [admin, web]);
  assert.deepEqual(roots(path.join(dir, "apps/{web,admin}")), [admin, web]);
  assert.deepEqual(roots([web, admin, 123]), [admin, web]);
  assert.deepEqual(roots(path.join(dir, "missing/*")), []);
  const relative = path.relative(process.cwd(), dir).split(path.sep).join("/");
  assert.deepEqual(roots(`${relative}/apps/*`), [`${relative}/apps/admin`, `${relative}/apps/web`]);
  assert.deepEqual(roots(`${web}/`), [web]);
});

test("both installed consumers preserve file glob options without directory expansion", t => {
  const dir = fixture(t);
  for (const require of [nextRequire, dynamicRequire]) {
    const { globSync } = require("tinyglobby");
    const options = { cwd: dir, expandDirectories: false };
    assert.deepEqual(globSync("modules/**/*.{js,ts}", options).sort(),
      ["modules/nested/index.js", "modules/one.js", "modules/two.ts"]);
    assert.deepEqual(globSync(["modules/*.js", "modules/*.{js,ts}", "!**/two.ts"], options), ["modules/one.js"]);
    assert.deepEqual(globSync("modules", options), []);
    assert.deepEqual(globSync("modules/.hidden.js", options), ["modules/.hidden.js"]);
    assert.deepEqual(globSync("nothing/*.js", options), []);
  }
});

for (const format of ["CommonJS", "ESM"]) {
  test(`Vinext's actual dynamic-import plugin transforms variable imports (${format})`, async t => {
    const dir = fixture(t);
    const pluginModule = format === "CommonJS"
      ? dynamicRequire("./index.js")
      : await import(pathToFileURL(dynamicRequire.resolve("./index.mjs")).href);
    const captured = [];
    const plugin = pluginModule.default({ loose: false, onFiles: files => { captured.push(...files); } });
    plugin.configResolved({
      root: dir, resolve: { alias: [], extensions: [".js", ".ts"] },
      optimizeDeps: {}, createResolver: () => async () => undefined,
    });
    const result = await plugin.transform('export const load = name => import(`./modules/${name}`);', path.join(dir, "entry.js"));
    assert.ok(result?.code);
    assert.deepEqual(captured.sort(), ["./modules/nested/index.js", "./modules/one.js", "./modules/two.ts"]);
    assert.match(result.code, /__variableDynamicImportRuntime/);
    assert.match(result.code, /import\('\.\/modules\/one\.js'\)/);
    assert.match(result.code, /import\('\.\/modules\/two\.ts'\)/);
    assert.doesNotMatch(result.code, /hidden|ignored/);
  });
}
