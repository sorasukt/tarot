import {loadMembership} from "./stripe.js";

const LIMITS={
  guest:{tarot:2,astrology:0,tts:0},
  free:{tarot:5,astrology:1,tts:0},
  member:{tarot:30,astrology:10,tts:20}
};

export async function entitlementFor(env,session,feature){
  const membership=session?.sub?await loadMembership(env,session.sub):null;
  const tier=membership?.active?"member":session?.sub?"free":"guest";
  return {tier,membership,limit:LIMITS[tier]?.[feature]??0};
}

export async function enforceDailyFeatureLimit(request,env,session,feature){
  if(!env.DB)return {allowed:false,status:503,code:"LIMIT_STORAGE_UNAVAILABLE",message:"ระบบตรวจสอบสิทธิ์การใช้งานไม่พร้อมใช้งาน"};
  const entitlement=await entitlementFor(env,session,feature);
  if(entitlement.limit<=0){
    const memberOnly=feature==="tts"||feature==="astrology"&&!session?.sub;
    return {allowed:false,status:403,code:memberOnly?"MEMBERSHIP_REQUIRED":"DAILY_LIMIT_REACHED",message:feature==="tts"?"เสียงอ่านไพ่เป็นสิทธิพิเศษสำหรับสมาชิก Tarot for your daily":"สิทธิ์การใช้งานสำหรับวันนี้ครบแล้ว",tier:entitlement.tier,limit:entitlement.limit,used:0};
  }

  const actorKey=session?.sub?`user:${session.sub}`:`ip:${request.headers.get("CF-Connecting-IP")||"unknown"}`;
  const quotaDate=thaiDateKey();
  await env.DB.prepare("INSERT OR IGNORE INTO ai_daily_quotas(actor_key,quota_date,feature,used_count,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP)").bind(actorKey,quotaDate,feature).run();
  const update=await env.DB.prepare("UPDATE ai_daily_quotas SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE actor_key=? AND quota_date=? AND feature=? AND used_count<?").bind(actorKey,quotaDate,feature,entitlement.limit).run();
  const row=await env.DB.prepare("SELECT used_count FROM ai_daily_quotas WHERE actor_key=? AND quota_date=? AND feature=?").bind(actorKey,quotaDate,feature).first();
  const used=Number(row?.used_count||0);
  if(!update.meta?.changes)return {allowed:false,status:429,code:"DAILY_LIMIT_REACHED",message:`ใช้สิทธิ์ ${featureLabel(feature)} ครบ ${entitlement.limit} ครั้งสำหรับวันนี้แล้ว`,tier:entitlement.tier,limit:entitlement.limit,used,retryAfter:secondsUntilThaiMidnight()};
  return {allowed:true,tier:entitlement.tier,limit:entitlement.limit,used,remaining:Math.max(0,entitlement.limit-used),membership:entitlement.membership};
}

export function publicEntitlements(tier="guest"){
  const limits=LIMITS[tier]||LIMITS.guest;
  return {
    tier,
    limits:{...limits},
    benefits:{
      voiceNarration:tier==="member",
      expandedTarot:tier==="member",
      deepAstrology:tier!=="guest"
    }
  };
}

export function entitlementLimits(){return JSON.parse(JSON.stringify(LIMITS))}

function featureLabel(feature){return ({tarot:"การเปิดไพ่",astrology:"ดวงดาวเชิงลึก",tts:"เสียงอ่านไพ่"})[feature]||"AI"}
function thaiDateKey(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function secondsUntilThaiMidnight(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(now);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const elapsed=Number(values.hour||0)*3600+Number(values.minute||0)*60+Number(values.second||0);
  return Math.max(60,86400-elapsed);
}
