import {loadMembership} from "./stripe.js";
import {readJsonBody,RequestBodyError} from "./request.js";

const CATEGORIES=new Set(["work","love","study","money","personal","other"]);
const DEFAULT_RETENTION_DAYS=60;

export async function saveReadingHistory(env,session,{question,selected,reading,category="personal",privateMode=false,requestKey=""}){
  if(privateMode||!session?.sub||!env.DB)return {saved:false,reason:privateMode?"private":"anonymous"};
  const normalizedCategory=CATEGORIES.has(category)?category:"personal";
  const cards=selected.map((card,index)=>({id:card.id,name:card.name,orientation:card.orientation,position:reading?.cards?.[index]?.position||""}));
  const preview=String(reading?.summary||reading?.overallReading||"").trim().slice(0,280);
  const id=crypto.randomUUID();
  const retentionDays=authoritativeRetentionDays(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO tarot_reading_history(id,user_sub,request_key,question,category,cards_json,preview,reading_json,expires_at)
    VALUES(?,?,?,?,?,?,?,?,datetime('now', ?))`)
    .bind(id,session.sub,requestKey||id,String(question||"").slice(0,500),normalizedCategory,JSON.stringify(cards),preview,JSON.stringify(reading),`+${retentionDays} days`).run();
  const row=await env.DB.prepare("SELECT id FROM tarot_reading_history WHERE user_sub=? AND request_key=?").bind(session.sub,requestKey||id).first();
  return {saved:true,id:row?.id||id};
}

export async function handleHistory(request,env,headers,session){
  if(!session?.sub)return json({success:false,error:{code:"UNAUTHORIZED",message:"Authentication required"}},401,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"ระบบประวัติยังไม่พร้อมใช้งาน"}},503,headers);
  const url=new URL(request.url);
  const suffix=url.pathname.slice("/api/member/history".length);
  if(suffix===""||suffix==="/"){
    if(request.method!=="GET")return methodNotAllowed(headers);
    return listHistory(url,env,headers,session);
  }
  if(suffix==="/insights"){
    if(request.method!=="GET")return methodNotAllowed(headers);
    return recurringInsights(url,env,headers,session);
  }
  const id=decodeURIComponent(suffix.replace(/^\//,""));
  if(!id||id.includes("/"))return json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,headers);
  if(request.method==="DELETE"){
    const result=await env.DB.prepare("DELETE FROM tarot_reading_history WHERE id=? AND user_sub=?").bind(id,session.sub).run();
    if(!result.meta?.changes)return json({success:false,error:{code:"NOT_FOUND",message:"ไม่พบคำอ่านนี้"}},404,headers);
    return json({success:true,deleted:true},200,headers);
  }
  if(request.method==="PATCH"||request.method==="PUT"){
    let body;
    try{body=await readJsonBody(request,2_048)}catch(error){if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);throw error}
    const category=CATEGORIES.has(body?.category)?body.category:"";
    if(!category)return json({success:false,error:{code:"INVALID_CATEGORY",message:"หมวดหมู่ไม่ถูกต้อง"}},400,headers);
    const result=await env.DB.prepare("UPDATE tarot_reading_history SET category=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_sub=?").bind(category,id,session.sub).run();
    if(!result.meta?.changes)return json({success:false,error:{code:"NOT_FOUND",message:"ไม่พบคำอ่านนี้"}},404,headers);
    return json({success:true,id,category},200,headers);
  }
  return methodNotAllowed(headers);
}

async function listHistory(url,env,headers,session){
  const access=await historyAccess(env,session);
  const requested=normalizeRange(url.searchParams.get("range"));
  const days=Math.min(requested,access.days);
  const category=CATEGORIES.has(url.searchParams.get("category"))?url.searchParams.get("category"):"";
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||50,1),100);
  let sql="SELECT id,question,category,cards_json,preview,created_at FROM tarot_reading_history WHERE user_sub=? AND expires_at>CURRENT_TIMESTAMP AND created_at>=datetime('now', ?)";
  const binds=[session.sub,`-${days} days`];
  if(category){sql+=" AND category=?";binds.push(category)}
  sql+=" ORDER BY created_at DESC LIMIT ?";binds.push(limit);
  const result=await env.DB.prepare(sql).bind(...binds).all();
  const items=(result.results||[]).map(row=>({...row,cards:safeJson(row.cards_json,[]),cards_json:undefined}));
  return json({success:true,items,access:{tier:access.tier,days,requestedDays:requested,retentionDays:access.retentionDays}},200,headers);
}

async function recurringInsights(url,env,headers,session){
  const access=await historyAccess(env,session);
  const requested=normalizeRange(url.searchParams.get("range"));
  const days=Math.min(requested,access.days);
  const result=await env.DB.prepare("SELECT cards_json FROM tarot_reading_history WHERE user_sub=? AND expires_at>CURRENT_TIMESTAMP AND created_at>=datetime('now', ?)").bind(session.sub,`-${days} days`).all();
  const cards=(result.results||[]).flatMap(row=>safeJson(row.cards_json,[]));
  return json({success:true,rangeDays:days,items:recurringCardStats(cards)},200,headers);
}

export function recurringCardStats(cards){
  const counts=new Map();
  for(const card of cards||[]){if(!card?.name)continue;const current=counts.get(card.name)||{cardName:card.name,count:0};current.count+=1;counts.set(card.name,current)}
  return [...counts.values()].filter(item=>item.count>1).sort((a,b)=>b.count-a.count||a.cardName.localeCompare(b.cardName)).slice(0,12);
}

export async function historyAccess(env,session){
  const membership=session?.sub?await loadMembership(env,session.sub):null;
  const tier=membership?.active?(membership.period==="yearly"?"annual_member":"member"):"free";
  const entitlementDays=tier==="annual_member"?365:tier==="member"?90:30;
  const retentionDays=authoritativeRetentionDays(env);
  return {tier,days:Math.min(entitlementDays,retentionDays),retentionDays};
}

export function authoritativeRetentionDays(env={}){
  const configured=Number(env.HISTORY_RETENTION_DAYS||DEFAULT_RETENTION_DAYS);
  if(!Number.isFinite(configured))return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.max(Math.floor(configured),1),365);
}

function normalizeRange(value){if(value==="30")return 30;if(value==="90")return 90;if(value==="365"||value==="all")return 365;return 30}
function safeJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function methodNotAllowed(headers){return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
