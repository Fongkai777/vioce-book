import test from "node:test";
import assert from "node:assert/strict";
import {syntheticPdf} from "./fixtures/pdf-data.ts";
test("patched PDF.js extracts both pages without changing page provenance",async()=>{
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task=getDocument({data:syntheticPdf(),useSystemFonts:true});
  try{
    const pdf=await task.promise;assert.equal(pdf.numPages,2);
    for(const [number,label] of [[1,"one"],[2,"two"]]){
      const page=await pdf.getPage(number);const content=await page.getTextContent();
      assert.match(content.items.map(item=>item.str||"").join(" "),new RegExp(`page ${label}`));
      assert.equal(page.pageNumber,number);page.cleanup();
    }
  }finally{await task.destroy();}
});
