import assert from "node:assert/strict";
import test from "node:test";
import {autocompletePlaces,resolvePlace} from "../src/geocoding.js";

test("public geocoding maps Open-Meteo search results to the existing form contract",async()=>{
  const originalFetch=globalThis.fetch;
  let requestedUrl="";
  globalThis.fetch=async url=>{
    requestedUrl=String(url);
    return Response.json({results:[{id:1609350,name:"กรุงเทพมหานคร",latitude:13.75,longitude:100.51667,timezone:"Asia/Bangkok",admin1:"กรุงเทพมหานคร",country:"ไทย"}]});
  };
  try{
    const results=await autocompletePlaces({},"กรุงเทพ");
    assert.equal(results.length,1);
    assert.deepEqual(results[0],{placeId:"1609350",text:"กรุงเทพมหานคร, ไทย",mainText:"กรุงเทพมหานคร",secondaryText:"ไทย"});
    const url=new URL(requestedUrl);
    assert.equal(url.hostname,"geocoding-api.open-meteo.com");
    assert.equal(url.searchParams.get("name"),"กรุงเทพ");
    assert.equal(url.searchParams.get("language"),"th");
  }finally{globalThis.fetch=originalFetch}
});

test("public geocoding resolves coordinates and timezone without an API key",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:1609350,name:"กรุงเทพมหานคร",latitude:13.75,longitude:100.51667,timezone:"Asia/Bangkok",country:"ไทย"});
  try{
    const place=await resolvePlace({},"1609350");
    assert.deepEqual(place,{placeId:"1609350",name:"กรุงเทพมหานคร, ไทย",lat:13.75,lng:100.51667,timezone:"Asia/Bangkok"});
  }finally{globalThis.fetch=originalFetch}
});

test("public geocoding rejects an untrusted location id before fetching",async()=>{
  const originalFetch=globalThis.fetch;
  let called=false;
  globalThis.fetch=async()=>{called=true;return Response.json({})};
  try{
    await assert.rejects(resolvePlace({},"../../unexpected"),/Invalid public geocoding place id/);
    assert.equal(called,false);
  }finally{globalThis.fetch=originalFetch}
});
