import {readJsonBody,RequestBodyError} from "./request.js";
import {historyAccess} from "./history.js";
import {generateGeminiJson,GeminiCapacityError,capacityError} from "./gemini.js";

const MOODS=new Set(["calm","hopeful","uncertain","heavy","curious"]);
const WEEKLY_SCHEMA={type:"object",additionalProperties:false,required:["title","themes","reflection","question"],properties:{title:{type:"string"},themes:{type:"array",minItems:1,maxItems:4,items:{type:"string"}},reflection:{type:"string"},question:{type:"string"},previousWeek:{type:"string"}}};

export async function handleReflections(request,env,headers,session){
  if(!session?.sub)return json({success:false,error:{code:"UNAUTHORIZED",message:"Authentication required"}},401,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"ระบบบันทึกยังไม่พร้อมใช้งาน"}},503,headers);
  const url=new URL(request.url),suffix=url.pathname.slice("/api/member/reflections".length);
  if(suffix==="/weekly")return weekly(request,env,headers,session);
  let historyId="";try{historyId=decodeURIComponent(suffix.replace(/^\//,""))}catch{return json({success:false,error:{code:"INVALID_HISTORY_ID",message:"ข้อมูลคำอ่านไม่ถูกต้อง"}},400,headers)}
  if(!historyId||historyId.includes("/"))return json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,headers);
  const owned=await env.DB.prepare("SELECT id FROM tarot_reading_history WHERE id=? AND user_sub=? AND expires_at>CURRENT_TIMESTAMP").bind(historyId,session.sub).first();
  if(!owned)return json({success:false,error:{code:"NOT_FOUND",message:"ไม่พบคำอ่านนี้หรือไม่สามารถบันทึกได้"}},404,headers);
  if(request.method==="GET"){
    const row=await env.DB.prepare("SELECT note,mood_before,mood_after,updated_at FROM tarot_reflections WHERE history_id=? AND user_sub=?").bind(historyId,session.sub).first();
    return json({success:true,reflection:row||null},200,headers);
  }
  if(request.method==="DELETE"){
    await env.DB.prepare("DELETE FROM tarot_reflections WHERE history_id=? AND user_sub=?").bind(historyId,session.sub).run();
    return json({success:true,deleted:true},200,headers);
  }
  if(request.method!=="PUT"&&request.method!=="POST")return methodNotAllowed(headers);
  let body;try{body=await readJsonBody(request,4_096)}catch(error){if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลบันทึกไม่ถูกต้อง"}},error.status,headers);throw error}
  const note=String(body?.note||"").trim().slice(0,1000),before=normalizeMood(body?.moodBefore),after=normalizeMood(body?.moodAfter);
  if(body?.moodBefore&&!before||body?.moodAfter&&!after)return json({success:false,error:{code:"INVALID_MOOD",message:"ตัวเลือกความรู้สึกไม่ถูกต้อง"}},400,headers);
  if(!note&&!before&&!after)return json({success:false,error:{code:"REFLECTION_REQUIRED",message:"เพิ่มบันทึกหรือเลือกความรู้สึกอย่างน้อยหนึ่งรายการ"}},400,headers);
  await env.DB.prepare(`INSERT INTO tarot_reflections(history_id,user_sub,note,mood_before,mood_after) VALUES(?,?,?,?,?)
    ON CONFLICT(history_id) DO UPDATE SET note=excluded.note,mood_before=excluded.mood_before,mood_after=excluded.mood_after,updated_at=CURRENT_TIMESTAMP WHERE user_sub=excluded.user_sub`).bind(historyId,session.sub,note||null,before||null,after||null).run();
  await env.DB.prepare("DELETE FROM tarot_weekly_reflections WHERE user_sub=? AND week_start=?").bind(session.sub,thaiWeekStart()).run();
  return json({success:true,reflection:{note,moodBefore:before||null,moodAfter:after||null}},200,headers);
}

async function weekly(request,env,headers,session){
  if(request.method!=="GET"&&request.method!=="POST")return methodNotAllowed(headers);
  const access=await historyAccess(env,session),weekStart=thaiWeekStart(),previousStart=shiftDate(weekStart,-7);
  const current=await weeklyRows(env,session.sub,weekStart,shiftDate(weekStart,7));
  const stats=weeklyStats(current);
  if(request.method==="GET"||access.tier==="free")return json({success:true,weekStart,tier:access.tier,stats,aiAvailable:access.tier!=="free"},200,headers);
  const cached=await env.DB.prepare("SELECT summary_json FROM tarot_weekly_reflections WHERE user_sub=? AND week_start=?").bind(session.sub,weekStart).first();
  if(cached?.summary_json)return json({success:true,weekStart,tier:access.tier,stats,summary:safeJson(cached.summary_json,null),cached:true},200,headers);
  if(!current.length)return json({success:false,error:{code:"WEEK_EMPTY",message:"สัปดาห์นี้ยังไม่มีบันทึกสำหรับสรุป"}},409,headers);
  const previous=access.tier==="annual_member"?weeklyStats(await weeklyRows(env,session.sub,previousStart,weekStart)):null;
  try{
    const {result}=await generateGeminiJson(env,{system:"Summarize the user's own Tarot journal as grounded reflection in Thai. Do not predict events, diagnose health, or claim Tarot caused a mood change.",prompt:JSON.stringify({weekStart,current:stats,entries:current.map(safeEntry),previousWeek:previous}),schema:WEEKLY_SCHEMA});
    await env.DB.prepare("INSERT INTO tarot_weekly_reflections(user_sub,week_start,tier,summary_json) VALUES(?,?,?,?) ON CONFLICT(user_sub,week_start) DO UPDATE SET tier=excluded.tier,summary_json=excluded.summary_json,updated_at=CURRENT_TIMESTAMP").bind(session.sub,weekStart,access.tier,JSON.stringify(result)).run();
    return json({success:true,weekStart,tier:access.tier,stats,summary:result,cached:false},200,headers);
  }catch(error){if(error instanceof GeminiCapacityError)return json({success:false,error:capacityError(env)},503,headers);throw error}
}

async function weeklyRows(env,sub,start,end){const result=await env.DB.prepare(`SELECT h.category,h.cards_json,h.preview,r.note,r.mood_before,r.mood_after FROM tarot_reading_history h LEFT JOIN tarot_reflections r ON r.history_id=h.id AND r.user_sub=h.user_sub WHERE h.user_sub=? AND h.created_at>=? AND h.created_at<? AND h.expires_at>CURRENT_TIMESTAMP ORDER BY h.created_at`).bind(sub,`${start} 00:00:00`,`${end} 00:00:00`).all();return result.results||[]}
export function weeklyStats(rows=[]){const categories={},cards={},moods={before:{},after:{}};for(const row of rows){categories[row.category||"personal"]=(categories[row.category||"personal"]||0)+1;for(const card of safeJson(row.cards_json,[])){if(card?.name)cards[card.name]=(cards[card.name]||0)+1}if(row.mood_before)moods.before[row.mood_before]=(moods.before[row.mood_before]||0)+1;if(row.mood_after)moods.after[row.mood_after]=(moods.after[row.mood_after]||0)+1}return {readings:rows.length,journals:rows.filter(row=>row.note).length,categories,recurringCards:Object.entries(cards).filter(([,count])=>count>1).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count})),moods}}
function safeEntry(row){return {category:row.category,preview:String(row.preview||"").slice(0,280),note:String(row.note||"").slice(0,1000),moodBefore:row.mood_before||null,moodAfter:row.mood_after||null,cards:safeJson(row.cards_json,[]).map(card=>card.name).filter(Boolean)}}
function normalizeMood(value){const mood=String(value||"");return MOODS.has(mood)?mood:""}
function thaiWeekStart(){const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),date=new Date(`${today}T12:00:00Z`),day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-day);return date.toISOString().slice(0,10)}
function shiftDate(value,days){const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function safeJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function methodNotAllowed(headers){return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
