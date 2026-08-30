import {readJsonBody,RequestBodyError} from "./request.js";

export const POLICY_VERSION="2026-08-28-payments1";

const EVENTS=new Set(["page_view","policy_accepted","action_started","action_completed","action_failed"]);
const FEATURES=new Set(["portal","daily","tarot","astrology","zodiac","colors","numbers","naming","profile","place_search","membership","support","billing"]);
const STATUSES=new Set(["started","completed","failed","cached"]);

export function hasCurrentPolicy(request){return request.headers.get("X-Tarot-Policy-Version")===POLICY_VERSION}

export async function loadPolicyAcceptance(env,userSub){
  if(!env.DB||!userSub)return null;
  return env.DB.prepare("SELECT policy_version,accepted_at FROM member_policy_acceptances WHERE user_sub=? AND policy_version=?")
    .bind(userSub,POLICY_VERSION).first();
}

export async function savePolicyAcceptance(request,env,headers,userSub){
  let body;
  try{body=await readJsonBody(request,2_048)}
  catch(error){if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);throw error}
  if(body?.policyVersion!==POLICY_VERSION||body?.accepted!==true)return json({success:false,error:{code:"POLICY_ACCEPTANCE_REQUIRED",message:"กรุณายอมรับนโยบายก่อนใช้งาน"}},400,headers);
  await env.DB.prepare(`INSERT INTO member_policy_acceptances(user_sub,policy_version,accepted_at,updated_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(user_sub) DO UPDATE SET policy_version=excluded.policy_version,accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
    .bind(userSub,POLICY_VERSION).run();
  return json({success:true,policyVersion:POLICY_VERSION},200,headers);
}

export async function handleUsage(request,env,headers,session=null){
  if(request.method!=="POST")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"ไม่สามารถบันทึกการใช้งานได้ในขณะนี้"}},503,headers);
  if(!hasCurrentPolicy(request))return json({success:false,error:{code:"POLICY_ACCEPTANCE_REQUIRED",message:"กรุณายอมรับนโยบายก่อนใช้งาน"}},428,headers);
  let body;
  try{body=await readJsonBody(request,2_048)}
  catch(error){if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);throw error}
  const eventName=EVENTS.has(body?.eventName)?body.eventName:"";
  const feature=FEATURES.has(body?.feature)?body.feature:"";
  const pagePath=typeof body?.pagePath==="string"&&body.pagePath.startsWith("/tarot/")&&body.pagePath.length<=160?body.pagePath:"";
  const status=STATUSES.has(body?.status)?body.status:null;
  const durationMs=Number.isInteger(body?.durationMs)?Math.min(Math.max(body.durationMs,0),300_000):null;
  if(!eventName||!feature||!pagePath)return json({success:false,error:{code:"INVALID_USAGE_EVENT",message:"ข้อมูลการใช้งานไม่ถูกต้อง"}},400,headers);
  const anonymousHash=session?.sub?null:await hashAnonymousId(body?.anonymousId);
  if(!session?.sub&&!anonymousHash)return json({success:false,error:{code:"INVALID_USAGE_EVENT",message:"ข้อมูลการใช้งานไม่ถูกต้อง"}},400,headers);
  const metadata=cleanMetadata(body?.metadata);
  await env.DB.prepare(`INSERT INTO usage_events(id,user_sub,anonymous_hash,event_name,feature,page_path,status,duration_ms,metadata_json,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,datetime('now','+60 days'))`)
    .bind(crypto.randomUUID(),session?.sub||null,anonymousHash,eventName,feature,pagePath,status,durationMs,metadata?JSON.stringify(metadata):null).run();
  return json({success:true},200,headers);
}

export async function purgeExpiredUserData(env){
  if(!env.DB)return;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM usage_events WHERE expires_at<=CURRENT_TIMESTAMP"),
    env.DB.prepare("DELETE FROM member_ai_results WHERE expires_at<=CURRENT_TIMESTAMP"),
    env.DB.prepare("DELETE FROM daily_readings WHERE reading_date<date('now','-60 days')")
  ]);
}

async function hashAnonymousId(value){
  if(typeof value!=="string"||value.length<16||value.length>100)return null;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function cleanMetadata(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const result={};
  if(typeof value.cached==="boolean")result.cached=value.cached;
  if(typeof value.errorCode==="string"&&/^[A-Z0-9_]{1,48}$/.test(value.errorCode))result.errorCode=value.errorCode;
  return Object.keys(result).length?result:null;
}

function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
