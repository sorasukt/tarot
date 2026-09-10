import test from "node:test";
import assert from "node:assert/strict";
import {handleReflections,weeklyStats} from "../src/reflections.js";

test("weekly reflection stats are deterministic and do not infer outcomes",()=>{
  const stats=weeklyStats([{category:"study",cards_json:JSON.stringify([{name:"The Star"},{name:"The Hermit"}]),note:"I need more time",mood_before:"uncertain",mood_after:"calm"},{category:"study",cards_json:JSON.stringify([{name:"The Star"}]),note:null,mood_before:"curious",mood_after:"hopeful"}]);
  assert.deepEqual(stats,{readings:2,journals:1,categories:{study:2},recurringCards:[{name:"The Star",count:2}],moods:{before:{uncertain:1,curious:1},after:{calm:1,hopeful:1}}});
});

test("a reflection cannot be written to another user's reading",async()=>{
  const DB={prepare(){return {bind(){return {first:async()=>null}}}}};
  const response=await handleReflections(new Request("https://api.test/api/member/reflections/history-1",{method:"PUT",body:JSON.stringify({note:"private"})}),{DB},new Headers(),{sub:"auth0|owner"});
  assert.equal(response.status,404);
});

test("reflection moods use a small non-clinical allowlist",async()=>{
  const DB={prepare(sql){return {bind(){return {first:async()=>sql.includes("tarot_reading_history")?{id:"history-1"}:null}}}}};
  const response=await handleReflections(new Request("https://api.test/api/member/reflections/history-1",{method:"PUT",body:JSON.stringify({moodBefore:"diagnosed"})}),{DB},new Headers(),{sub:"auth0|owner"});
  assert.equal(response.status,400);assert.equal((await response.json()).error.code,"INVALID_MOOD");
});
