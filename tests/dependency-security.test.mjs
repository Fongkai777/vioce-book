import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const root=createRequire(import.meta.url);
const resolveChain=chain=>{let require=root;for(const pkg of chain)require=createRequire(pkg==="vinext"?import.meta.resolve(pkg):require.resolve(pkg));return require;};
// Verify the copies actually used by both vulnerable transitive paths, not an
// unrelated package that happens to be installed next to the test.
for(const chain of [["eslint-config-next","@next/eslint-plugin-next","fast-glob","micromatch"],
  ["vinext","vite-plugin-commonjs","vite-plugin-dynamic-import","fast-glob","micromatch"]]) {
  test(`${chain[0]} uses patched braces for strings and directly supplied ASTs`,()=>{
    const braces=resolveChain(chain)("braces");
    assert.deepEqual(braces.expand("src/{app,lib}/*.{ts,tsx}"),["src/app/*.ts","src/app/*.tsx","src/lib/*.ts","src/lib/*.tsx"]);
    for(const pattern of ["{".repeat(10000)+"a,b"+"}".repeat(10000),"(".repeat(10000)+"x"+")".repeat(10000),"{".repeat(10000)]) {
      for(const op of ["parse","compile","expand","stringify"])assert.throws(()=>braces[op](pattern),{name:"SyntaxError"});
    }
    let ast={type:"text",value:"x"};for(let i=0;i<10000;i++)ast={type:"brace",nodes:[ast]};
    for(const op of ["compile","expand","stringify"])assert.throws(()=>braces[op](ast),{name:"SyntaxError"});
    const cycle={type:"root",nodes:[]};cycle.nodes.push(cycle);
    for(const op of ["compile","expand","stringify"])assert.throws(()=>braces[op](cycle),{name:"SyntaxError"});
  });
}
