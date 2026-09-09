import {entitlementFor} from "./entitlements.js";
import {readJsonBody,RequestBodyError} from "./request.js";

// Count acknowledged results, not generation attempts. Tokens/receipts contain no reading text.
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
    const pendingSql="SELECT COUNT(*) FROM quota_deliveries d WHERE d.actor_key=? AND d.quota_date=? AND d.feature=? AND d.request_key<>? AND d.expires_at>CURRENT_TIMESTAMP AND NOT EXISTS (SELECT 1 FROM tarot_quota_receipts r WHERE r.actor_key=d.actor_key AND r.quota_date=d.quota_date AND r.request_key=d.request_key)";
    const usedSql="SELECT used_count FROM ai_daily_quotas WHERE actor_key=? AND quota_date=? AND feature=?";
    const capacitySql=`COALESCE((${usedSql}),0)+(${pendingSql})<?`;
    const capacityArgs=[actor,day,feature,actor,day,feature,requestKey,limit];
    const awaitingDelivery=()=>json({success:false,error:{code:"DELIVERY_PENDING",message:"มีผลลัพธ์ที่กำลังรอยืนยัน กรุณาลองรายการเดิมหรือรอสักครู่"}},409);
    if(!alreadyCharged){
      const row=await env.DB.prepare("SELECT used_count FROM ai_daily_quotas WHERE actor_key=? AND quota_date=? AND feature=?").bind(actor,day,feature).first();
      if(Number(row?.used_count||0)>=limit)return exhausted();
      const capacity=await env.DB.prepare(`SELECT (${capacitySql}) AS available`).bind(...capacityArgs).first();
      if(!capacity?.available)return awaitingDelivery();
    }
    const response=await generate();
    if(!response.ok||response.status===202)return response;
    const invalid=()=>json({success:false,error:{code:"INCOMPLETE_RESULT",message:"ได้รับผลลัพธ์ไม่ครบ กรุณาลองใหม่อีกครั้ง"}},502);
    if(feature==='tts'){
      if(!response.headers.get('Content-Type')?.startsWith('audio/')||!(await response.clone().arrayBuffer()).byteLength)return invalid();
    }else{
      const data=await response.clone().json().catch(()=>null);
      if(!data?.success)return invalid();
      const text=value=>typeof value==='string'&&value.trim().length>0;
      if(feature==='tarot'&&(!Array.isArray(data.reading?.cards)||data.reading.cards.length!==5||!data.reading.cards.every(card=>text(card?.interpretation))||!text(data.reading.overallReading||data.reading.summary)))return invalid();
      if(feature==='astrology'&&!text(data.reading?.overview))return invalid();
    }
    if(alreadyCharged)return response;

    // A generated response is not proof of delivery. Only the browser can acknowledge it.
    if(request.signal.aborted)return json({success:false,error:{code:"DELIVERY_CANCELLED",message:"การเชื่อมต่อถูกยกเลิก กรุณาลองใหม่"}},499);
    if(await receipt())return response;
    const token=crypto.randomUUID();
    // Hold capacity without debiting it. Abandoned text deliveries expire in two minutes;
    // audio has fifteen minutes to finish. Expiration NEVER converts a hold into usage.
    const lifetime=feature==="tts"?"+15 minutes":"+2 minutes";
    await env.DB.prepare(`INSERT INTO quota_deliveries(token,actor_key,quota_date,request_key,feature,expires_at) SELECT ?,?,?,?,?,datetime('now',?) WHERE ${capacitySql} ON CONFLICT(actor_key,quota_date,request_key) DO UPDATE SET token=CASE WHEN quota_deliveries.expires_at<=CURRENT_TIMESTAMP THEN excluded.token ELSE quota_deliveries.token END,expires_at=excluded.expires_at`)
      .bind(token,actor,day,requestKey,feature,lifetime,...capacityArgs).run();
    const delivery=await env.DB.prepare("SELECT token FROM quota_deliveries WHERE actor_key=? AND quota_date=? AND request_key=? AND expires_at>CURRENT_TIMESTAMP").bind(actor,day,requestKey).first();
    if(!delivery?.token){if(await receipt())return response;return awaitingDelivery();}
    const delivered=new Response(response.body,response);
    delivered.headers.set("X-Tarot-Delivery",delivery.token);
    delivered.headers.set("Access-Control-Expose-Headers","X-Tarot-Delivery");
    delivered.headers.set("Cache-Control","no-store");
    return delivered;
  }catch(error){
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:error.message}},error.status);
    console.error(JSON.stringify({message:"Tarot completion/quota failed",error:error?.name||"error"}));
    return unavailable();
  }
}

// The receipt and quota increment commit together. Retrying an acknowledgement is harmless.
export async function acknowledgeDelivery(request,env,session,headers){
  const json=(data,status=200)=>Response.json(data,{status,headers});
  if(request.method!=="POST")return json({success:false},405);
  try{
    const body=await readJsonBody(request,1024);
    if(typeof body?.token!=="string"||!/^[a-f0-9-]{36}$/.test(body.token))return json({success:false},400);
    const actor=session?.sub?`user:${session.sub}`:`ip:${request.headers.get("CF-Connecting-IP")||"unknown"}`;
    const row=await env.DB.prepare("SELECT * FROM quota_deliveries WHERE token=? AND actor_key=? AND expires_at>CURRENT_TIMESTAMP").bind(body.token,actor).first();
    if(!row)return json({success:false},404);
    const {quota_date:day,request_key:key,feature}=row;
    if(body.outcome==="failed"){
      await env.DB.prepare("DELETE FROM quota_deliveries WHERE token=? AND actor_key=? AND NOT EXISTS (SELECT 1 FROM tarot_quota_receipts WHERE actor_key=? AND quota_date=? AND request_key=?)").bind(body.token,actor,actor,day,key).run();
      return json({success:true,counted:false});
    }
    if(body.outcome!=="received")return json({success:false},400);
    const {limit}=await entitlementFor(env,session,feature);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO ai_daily_quotas(actor_key,quota_date,feature,used_count,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP)").bind(actor,day,feature),
      env.DB.prepare("UPDATE ai_daily_quotas SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE actor_key=? AND quota_date=? AND feature=? AND used_count<? AND NOT EXISTS (SELECT 1 FROM tarot_quota_receipts WHERE actor_key=? AND quota_date=? AND request_key=?)").bind(actor,day,feature,limit,actor,day,key),
      env.DB.prepare("INSERT INTO tarot_quota_receipts(actor_key,quota_date,request_key) SELECT ?,?,? WHERE changes()=1").bind(actor,day,key)
    ]);
    const receipt=await env.DB.prepare("SELECT request_key FROM tarot_quota_receipts WHERE actor_key=? AND quota_date=? AND request_key=?").bind(actor,day,key).first();
    return json({success:true,counted:Boolean(receipt)});
  }catch(error){
    if(error instanceof RequestBodyError)return json({success:false},error.status);
    console.error(JSON.stringify({message:"Delivery acknowledgement failed",error:error?.name||"error"}));
    return json({success:false},503);
  }
}
