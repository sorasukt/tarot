import {autocompletePlaces,resolvePlace} from "./geocoding.js";
import {readJsonBody,RequestBodyError} from "./request.js";
import {validIsoDate,validTime} from "./validation.js";
import {getMemberAiResult,saveMemberAiResult} from "./ai-cache.js";
import {savePolicyAcceptance} from "./usage.js";
import {capacityError,generateGeminiJson,GeminiCapacityError,geminiCacheVersion} from "./gemini.js";

const DAILY_SCHEMA={type:"object",additionalProperties:false,required:["title","summary","energy","focus","avoid","advice","luckyColor","luckyColorHex","luckyColorMeaning","luckyColorUse"],properties:{title:{type:"string"},summary:{type:"string"},energy:{type:"string"},focus:{type:"string"},avoid:{type:"string"},advice:{type:"string"},luckyColor:{type:"string"},luckyColorHex:{type:"string",pattern:"^#[0-9A-Fa-f]{6}$"},luckyColorMeaning:{type:"string"},luckyColorUse:{type:"string"}}};
const ASTRO_SCHEMA={type:"object",additionalProperties:false,required:["title","overview","strengths","growth","relationships","reflection"],properties:{title:{type:"string"},overview:{type:"string"},strengths:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},growth:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},relationships:{type:"string"},reflection:{type:"string"}}};

export async function handleMember(request,env,headers,auth,deck){
  const url=new URL(request.url);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"Member storage is not configured"}},503,headers);
  if(url.pathname==="/api/member/places/autocomplete"){
    if(request.method!=="GET")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
    try{return json({success:true,suggestions:await autocompletePlaces(env,url.searchParams.get("q")||"")},200,headers)}catch(e){return json({success:false,error:{code:"PLACES_UNAVAILABLE",message:"ไม่สามารถค้นหาสถานที่ได้ในขณะนี้"}},502,headers)}
  }
  if(url.pathname==="/api/member/profile"){
    if(request.method==="GET")return getProfile(env,headers,auth.payload.sub);
    if(request.method==="PUT"||request.method==="POST")return saveProfile(request,env,headers,auth.payload.sub);
    return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  }
  if(url.pathname==="/api/member/consent"){
    if(request.method!=="POST")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
    return savePolicyAcceptance(request,env,headers,auth.payload.sub);
  }
  if(url.pathname==="/api/member/daily"){if(request.method!=="GET")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);return getDaily(env,headers,auth.payload.sub,deck)}
  if(url.pathname==="/api/member/astrology"){if(request.method!=="GET")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);return getAstrology(env,headers,auth.payload.sub)}
  return null;
}

async function getProfile(env,headers,sub){const profile=await env.DB.prepare("SELECT birth_date,birth_time,birth_place,birth_place_id,birth_lat,birth_lng,birth_timezone,timezone,updated_at FROM member_profiles WHERE user_sub=?").bind(sub).first();return json({success:true,profile:profile||null},200,headers)}

async function saveProfile(request,env,headers,sub){
  let body;
  try{body=await readJsonBody(request,4_096)}
  catch(error){if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:error.status===413?"ข้อมูลคำขอมีขนาดใหญ่เกินไป":"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);throw error}
  const birthDate=validIsoDate(typeof body.birthDate==="string"?body.birthDate.trim():"");
  const birthTime=typeof body.birthTime==="string"?body.birthTime.trim():"";
  const birthPlaceId=typeof body.birthPlaceId==="string"?body.birthPlaceId.trim():"";
  if(!birthDate)return json({success:false,error:{code:"INVALID_BIRTH_DATE",message:"กรุณาระบุวันเดือนปีเกิดให้ถูกต้อง"}},400,headers);
  if(birthTime&&!validTime(birthTime))return json({success:false,error:{code:"INVALID_BIRTH_TIME",message:"เวลาเกิดไม่ถูกต้อง"}},400,headers);
  let place={placeId:null,name:null,lat:null,lng:null,timezone:null};
  if(birthPlaceId){try{place=await resolvePlace(env,birthPlaceId)}catch{return json({success:false,error:{code:"INVALID_BIRTH_PLACE",message:"ไม่สามารถยืนยันสถานที่เกิดได้ กรุณาเลือกจากรายการอีกครั้ง"}},400,headers)}}
  else if(body.birthPlace){return json({success:false,error:{code:"BIRTH_PLACE_SELECTION_REQUIRED",message:"กรุณาเลือกสถานที่เกิดจากรายการแนะนำ"}},400,headers)}
  await env.DB.prepare(`INSERT INTO member_profiles(user_sub,birth_date,birth_time,birth_place,birth_place_id,birth_lat,birth_lng,birth_timezone,timezone,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  ON CONFLICT(user_sub) DO UPDATE SET birth_date=excluded.birth_date,birth_time=excluded.birth_time,birth_place=excluded.birth_place,birth_place_id=excluded.birth_place_id,birth_lat=excluded.birth_lat,birth_lng=excluded.birth_lng,birth_timezone=excluded.birth_timezone,timezone=excluded.timezone,updated_at=CURRENT_TIMESTAMP`)
  .bind(sub,birthDate,birthTime||null,place.name,place.placeId,place.lat,place.lng,place.timezone,place.timezone||"Asia/Bangkok").run();
  return json({success:true,profile:{birth_date:birthDate,birth_time:birthTime||null,birth_place:place.name,birth_place_id:place.placeId,birth_lat:place.lat,birth_lng:place.lng,birth_timezone:place.timezone}},200,headers);
}

async function getAstrology(env,headers,sub){
  const p=await env.DB.prepare("SELECT birth_date,birth_time,birth_place,birth_lat,birth_lng,birth_timezone FROM member_profiles WHERE user_sub=?").bind(sub).first();
  if(!p)return json({success:false,error:{code:"PROFILE_REQUIRED",message:"กรุณาเพิ่มวันเดือนปีเกิดในหน้า ฉัน ก่อนดูแบบเชิงลึก"}},409,headers);
  const cached=await getMemberAiResult(env,sub,"member:astrology:v1",{modelChain:geminiCacheVersion(env),birthDate:p.birth_date,birthTime:p.birth_time||"",birthPlace:p.birth_place||"",birthLat:p.birth_lat??null,birthLng:p.birth_lng??null,birthTimezone:p.birth_timezone||""});
  if(cached.cached)return json({success:true,cached:true,reading:cached.value},200,headers);
  if(!env.GEMINI_API_KEY)return json({success:false,error:{code:"SERVER_CONFIG_ERROR",message:"AI service is not configured"}},500,headers);
  const prompt=`Create a deeper reflective astrology-style profile in natural Thai using: birth date ${p.birth_date}, birth time ${p.birth_time||"not provided"}, birth place ${p.birth_place||"not provided"}, coordinates ${p.birth_lat??"not provided"}, ${p.birth_lng??"not provided"}, timezone ${p.birth_timezone||"not provided"}. Do not invent exact planetary placements, houses, ascendant, or astronomical calculations. Focus on themes, strengths, growth areas, relationships, and one reflection question.`;
  try{const {result:reading}=await generateGeminiJson(env,{system:"You provide grounded astrology-inspired reflective guidance. Never claim astronomical positions that were not calculated. Never present fate as certain.",prompt,schema:ASTRO_SCHEMA});await saveMemberAiResult(env,sub,"member:astrology:v1",cached.key,reading);return json({success:true,cached:false,reading},200,headers)}catch(error){if(error instanceof GeminiCapacityError)return json({success:false,error:capacityError(env)},503,headers);const t=error?.name==="AbortError";return json({success:false,error:{code:t?"AI_TIMEOUT":"AI_GENERATION_FAILED",message:"ไม่สามารถสร้างการอ่านเชิงลึกได้ในขณะนี้"}},t?504:502,headers)}
}

async function getDaily(env,headers,sub,deck){
  if(!env.GEMINI_API_KEY)return json({success:false,error:{code:"SERVER_CONFIG_ERROR",message:"AI service is not configured"}},500,headers);
  const p=await env.DB.prepare("SELECT birth_date,birth_time,birth_place FROM member_profiles WHERE user_sub=?").bind(sub).first();
  if(!p)return json({success:false,error:{code:"PROFILE_REQUIRED",message:"กรุณาระบุวันเดือนปีเกิดก่อนดูดวงประจำวัน"}},409,headers);
  const day=bangkokDate();const cached=await env.DB.prepare("SELECT status,card_id,card_name,horoscope_json FROM daily_readings WHERE user_sub=? AND reading_date=?").bind(sub,day).first();
  if(cached?.status==="ready"&&cached.horoscope_json){try{const horoscope=JSON.parse(cached.horoscope_json);if(hasCompleteDailyReading(horoscope))return json({success:true,cached:true,date:day,card:{id:cached.card_id,name:cached.card_name},horoscope},200,headers);await env.DB.prepare("DELETE FROM daily_readings WHERE user_sub=? AND reading_date=?").bind(sub,day).run()}catch{await env.DB.prepare("DELETE FROM daily_readings WHERE user_sub=? AND reading_date=?").bind(sub,day).run()}}
  if(cached?.status==="pending"){
    const released=await env.DB.prepare("DELETE FROM daily_readings WHERE user_sub=? AND reading_date=? AND status='pending' AND updated_at <= datetime('now','-1 minute')").bind(sub,day).run();
    if(!released.meta?.changes)return json({success:false,pending:true,error:{code:"DAILY_PENDING",message:"กำลังจัดทำดวงประจำวันของคุณ"}},202,headers);
  }
  const cardId=await dailyCardId(`${sub}:${day}`,deck.length),card=deck[cardId];const inserted=await env.DB.prepare("INSERT OR IGNORE INTO daily_readings(user_sub,reading_date,status,card_id,card_name,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)").bind(sub,day,"pending",card.id,card.name).run();if(!inserted.meta?.changes)return json({success:false,pending:true,error:{code:"DAILY_PENDING",message:"กำลังจัดทำดวงประจำวันของคุณ"}},202,headers);
  try{const {result:horoscope}=await generateGeminiJson(env,{system:"You create concise, grounded daily reflective horoscope guidance in natural Thai. Treat astrology, Tarot, and color symbolism as reflective frameworks, not factual prediction. Never claim certainty.",prompt:`Create today's personalized daily reflection for ${day}. Birth date: ${p.birth_date}. Birth time: ${p.birth_time||"not provided"}. Birth place: ${p.birth_place||"not provided"}. Daily Tarot card: ${card.name}. Include one familiar Thai lucky-color name, a valid six-digit hex color, its symbolic meaning, and one simple low-stakes way to use it today. Never promise that the color changes an outcome.`,schema:DAILY_SCHEMA});await env.DB.prepare("UPDATE daily_readings SET status='ready',horoscope_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_sub=? AND reading_date=?").bind(JSON.stringify(horoscope),sub,day).run();return json({success:true,cached:false,date:day,card:{id:card.id,name:card.name},horoscope},200,headers)}catch(error){await env.DB.prepare("DELETE FROM daily_readings WHERE user_sub=? AND reading_date=? AND status='pending'").bind(sub,day).run();if(error instanceof GeminiCapacityError)return json({success:false,error:capacityError(env)},503,headers);const t=error?.name==="AbortError";return json({success:false,error:{code:t?"AI_TIMEOUT":"AI_GENERATION_FAILED",message:"ไม่สามารถสร้างดวงประจำวันได้ในขณะนี้"}},t?504:502,headers)}
}

export function hasCompleteDailyReading(value){return Boolean(value&&typeof value==="object"&&typeof value.luckyColor==="string"&&/^#[0-9A-Fa-f]{6}$/.test(value.luckyColorHex||"")&&typeof value.luckyColorMeaning==="string"&&typeof value.luckyColorUse==="string")}

function bangkokDate(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${v.year}-${v.month}-${v.day}`}
async function dailyCardId(seed,length){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(seed));return new DataView(bytes).getUint32(0,false)%length}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
