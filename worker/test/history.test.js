import assert from "node:assert/strict";
import test from "node:test";
import {recurringCardStats,retentionDaysForTier,saveReadingHistory} from "../src/history.js";

test("recurring card insight is deterministic and only returns repeats",()=>{
  const items=recurringCardStats([
    {name:"The Hermit"},{name:"The Star"},{name:"The Hermit"},{name:"The Sun"},{name:"The Star"},{name:"The Hermit"}
  ]);
  assert.deepEqual(items,[{cardName:"The Hermit",count:3},{cardName:"The Star",count:2}]);
});

test("history retention follows membership tiers and stays bounded",()=>{
  assert.equal(retentionDaysForTier("free",{}),30);
  assert.equal(retentionDaysForTier("member",{}),180);
  assert.equal(retentionDaysForTier("annual_member",{}),730);
  assert.equal(retentionDaysForTier("free",{HISTORY_RETENTION_FREE_DAYS:"45"}),45);
  assert.equal(retentionDaysForTier("member",{HISTORY_RETENTION_MEMBER_DAYS:"365"}),365);
  assert.equal(retentionDaysForTier("annual_member",{HISTORY_RETENTION_ANNUAL_DAYS:"9999"}),1095);
  assert.equal(retentionDaysForTier("free",{HISTORY_RETENTION_FREE_DAYS:"0"}),1);
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
