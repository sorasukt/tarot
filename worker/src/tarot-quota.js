import {entitlementFor} from "./entitlements.js";
import {readJsonBody,RequestBodyError} from "./request.js";

// Count completed readings, not provider attempts. Receipts contain no reading text.
export const withTarotQuota=(request,env,session,headers,generate)=>withFeatureQuota(request,env,session,headers,generate,"tarot");
export async function withFeatureQuota(request,env,session,headers,generate,feature){
  const json=(data,status)=>new Response(JSON.stringify(data),{status,headers});
  const unavailable=()=>json({success:false,error:{code:"LIMIT_STORAGE_UNAVAILABLE",message:"ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}},503);
  if(!env.DB)return unavailable();
  try{
    const profile=feature==="astrology"&&session?.sub?await env.DB.prepare("SELECT birth_date,birth_time,birth_place_id,updated_at FROM member_profiles WHERE user_sub=?").bind(session.sub).first():null;
    const body=request.method==="GET"?{path:new URL(request.url).pathname}:await readJsonBody(request.clone(),feature==="tts"?32_000:12_000);
    // Hash the entire body so a reused request ID cannot authorize different cards/questions.
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({feature,body,...(profile?{profile}: {})})));
    const requestKey=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
    const actor=session?.sub?`user:${session.sub}`:`ip:${request.headers.get("CF-Connecting-IP")||"unknown"}`;
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const receipt=()=>env.DB.prepare("SELECT request_key FROM tarot_quota_receipts WHERE actor_key=? AND quota_date=? AND request_key=?").bind(actor,day,requestKey).first();
    const {limit}=await entitlementFor(env,session,feature);
    const alreadyCharged=await receipt();
    if(limit<=0)return json({success:false,error:{code:"MEMBERSHIP_REQUIRED",message:"กรุณาลงชื่อใช้งานหรือเลือกสิทธิ์สมาชิกสำหรับบริการนี้"}},403);
    const exhausted=()=>json({success:false,error:{code:"DAILY_LIMIT_REACHED",message:"ใช้สิทธิ์บริการนี้ครบแล้วสำหรับวันนี้"}},429);
    if(!alreadyCharged){
      const row=await env.DB.prepare("SELECT used_count FROM ai_daily_quotas WHERE actor_key=? AND quota_date=? AND feature=?").bind(actor,day,feature).first();
      if(Number(row?.used_count||0)>=limit)return exhausted();
    }
    const response=await generate();
    if(!response.ok||response.status===202)return response;
    if(feature==='tts'){if(!response.headers.get('Content-Type')?.startsWith('audio/')||!(await response.clone().arrayBuffer()).byteLength)return response;}
    else{const data=await response.clone().json().catch(()=>null);if(!data?.success)return response;if(feature==='tarot'&&(!Array.isArray(data.reading?.cards)||data.reading.cards.length!==5))return response;}
    if(alreadyCharged)return response;

    // D1 batch is transactional: increment and receipt must succeed together.
    // changes() belongs to the immediately preceding UPDATE on this connection.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO ai_daily_quotas(actor_key,quota_date,feature,used_count,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP)").bind(actor,day,feature),
      env.DB.prepare("UPDATE ai_daily_quotas SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE actor_key=? AND quota_date=? AND feature=? AND used_count<? AND NOT EXISTS (SELECT 1 FROM tarot_quota_receipts WHERE actor_key=? AND quota_date=? AND request_key=?)").bind(actor,day,feature,limit,actor,day,requestKey),
      env.DB.prepare("INSERT INTO tarot_quota_receipts(actor_key,quota_date,request_key) SELECT ?,?,? WHERE changes()=1").bind(actor,day,requestKey)
    ]);
    if(!await receipt())return exhausted();
    return response;
  }catch(error){
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:error.message}},error.status);
    console.error(JSON.stringify({message:"Tarot completion/quota failed",error:error?.name||"error"}));
    return unavailable();
  }
}
