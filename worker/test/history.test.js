import assert from "node:assert/strict";
import test from "node:test";
import {authoritativeRetentionDays,recurringCardStats,saveReadingHistory} from "../src/history.js";

test("recurring card insight is deterministic and only returns repeats",()=>{
  const items=recurringCardStats([
    {name:"The Hermit"},{name:"The Star"},{name:"The Hermit"},{name:"The Sun"},{name:"The Star"},{name:"The Hermit"}
  ]);
  assert.deepEqual(items,[{cardName:"The Hermit",count:3},{cardName:"The Star",count:2}]);
});

test("history retention defaults to 60 days and is bounded",()=>{
  assert.equal(authoritativeRetentionDays({}),60);
  assert.equal(authoritativeRetentionDays({HISTORY_RETENTION_DAYS:"30"}),30);
  assert.equal(authoritativeRetentionDays({HISTORY_RETENTION_DAYS:"999"}),365);
  assert.equal(authoritativeRetentionDays({HISTORY_RETENTION_DAYS:"0"}),1);
});

test("private mode never writes reading history",async()=>{
  let prepared=false;
  const env={DB:{prepare(){prepared=true;throw new Error("must not write")}}};
  const result=await saveReadingHistory(env,{sub:"auth0|member"},{question:"private",selected:[],reading:{},privateMode:true,requestKey:"private-key"});
  assert.deepEqual(result,{saved:false,reason:"private"});
  assert.equal(prepared,false);
});

test("anonymous readings are not persisted",async()=>{
  const result=await saveReadingHistory({DB:{}},null,{question:"guest",selected:[],reading:{},privateMode:false});
  assert.deepEqual(result,{saved:false,reason:"anonymous"});
});
