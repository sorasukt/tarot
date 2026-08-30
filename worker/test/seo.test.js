import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const pages=[
  ["../../index.html","https://sorasukt.com/tarot/"],
  ["../../reading/index.html","https://sorasukt.com/tarot/reading/"],
  ["../../astrology/index.html","https://sorasukt.com/tarot/astrology/"],
  ["../../zodiac/index.html","https://sorasukt.com/tarot/zodiac/"],
  ["../../colors/index.html","https://sorasukt.com/tarot/colors/"],
  ["../../numbers/index.html","https://sorasukt.com/tarot/numbers/"],
  ["../../naming/index.html","https://sorasukt.com/tarot/naming/"],
  ["../../membership/index.html","https://sorasukt.com/tarot/membership/"],
  ["../../support/index.html","https://sorasukt.com/tarot/support/"],
  ["../../about/index.html","https://sorasukt.com/tarot/about/"]
];

test("every public page has complete discoverability metadata",async()=>{
  for(const [file,canonical] of pages){
    const html=await readFile(new URL(file,import.meta.url),"utf8");
    assert.equal((html.match(/<title>/g)||[]).length,1,file);
    assert.match(html,/<meta name="description" content="[^"]+">/,file);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`),file);
    assert.match(html,/<meta name="robots" content="index,follow,max-image-preview:large">/,file);
    assert.match(html,/<meta property="og:title" content="[^"]+">/,file);
    assert.match(html,/<meta name="twitter:title" content="[^"]+">/,file);
  }
});

test("private account page is excluded from search",async()=>{
  for(const file of ["../../me/index.html","../../billing/success/index.html"]){
    const html=await readFile(new URL(file,import.meta.url),"utf8");
    assert.match(html,/<meta name="robots" content="noindex,nofollow">/,file);
  }
});
