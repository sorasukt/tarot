import {readJsonBody,RequestBodyError} from "./request.js";
import {validCalendarDate,validIsoDate,validTime} from "./validation.js";
import {getMemberAiResult,saveMemberAiResult} from "./ai-cache.js";
import {capacityError,generateGeminiJson,GeminiCapacityError,geminiCacheVersion} from "./gemini.js";

const RESULT_SCHEMA={type:"object",additionalProperties:false,required:["title","summary","insights","reflection"],properties:{title:{type:"string"},summary:{type:"string"},insights:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},reflection:{type:"string"}}};
const NAMING_SCHEMA={type:"object",additionalProperties:false,required:["title","names","note"],properties:{title:{type:"string"},names:{type:"array",minItems:3,maxItems:6,items:{type:"object",additionalProperties:false,required:["name","meaning","tone"],properties:{name:{type:"string"},meaning:{type:"string"},tone:{type:"string"}}}},note:{type:"string"}}};
const COLOR_SCHEMA={type:"object",additionalProperties:false,required:["title","colorName","hex","meaning","suggestions","reflection"],properties:{title:{type:"string"},colorName:{type:"string"},hex:{type:"string",pattern:"^#[0-9A-Fa-f]{6}$"},meaning:{type:"string"},suggestions:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},reflection:{type:"string"}}};

export async function handleFortune(request,env,headers,session=null,profile=null){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/fortune/'))return null;
  if(request.method!=="POST")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  if(!env.GEMINI_API_KEY)return json({success:false,error:{code:"SERVER_CONFIG_ERROR",message:"AI service is not configured"}},500,headers);
  let body;
  try{body=await readJsonBody(request,12_000)}
  catch(error){
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:error.status===413?"ข้อมูลคำขอมีขนาดใหญ่เกินไป":"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);
    throw error;
  }
  const kind=url.pathname.slice('/api/fortune/'.length);
  try{
    if(kind==='zodiac')return zodiac(body,env,headers,session,profile);
    if(kind==='numbers')return numbers(body,env,headers,session,profile);
    if(kind==='naming')return naming(body,env,headers,session,profile);
    if(kind==='astrology')return astrology(body,env,headers,session,profile);
    if(kind==='colors')return colors(body,env,headers,session,profile);
    return json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,headers);
  }catch(error){
    const timeout=error?.name==='AbortError';
    console.error(JSON.stringify({message:'Fortune API failed',kind,error:error?.name||error?.message||'error'}));
    if(error instanceof GeminiCapacityError)return json({success:false,error:capacityError(env)},503,headers);
    return json({success:false,error:{code:timeout?'AI_TIMEOUT':'AI_GENERATION_FAILED',message:timeout?'กำลังใช้เวลานานกว่าปกติ เราจะลองให้อีกครั้งอัตโนมัติ':'ไม่สามารถสร้างผลลัพธ์ได้ในขณะนี้'}},timeout?504:502,headers);
  }
}

async function zodiac(body,env,headers,session,profile){
  const birthDate=validIsoDate(body.birthDate)||profile?.birth_date;
  if(!birthDate)return json({success:false,error:{code:'INVALID_BIRTH_DATE',message:'กรุณาระบุวันเดือนปีเกิด'}},400,headers);
  const context=memberContext(session,profile);
  const prompt=`Create a concise zodiac-inspired reflective reading in natural Thai for birth date ${birthDate}. ${context} Explain the sun-sign theme without presenting personality as fixed or fate as certain. Give practical reflective insights for everyday life.`;
  const generated=await generateCached(env,session,"fortune:zodiac:v1",{birthDate,profile:profileInput(profile)},"You provide grounded zodiac-inspired reflection for entertainment and self-reflection. Never claim certainty or supernatural fact.",prompt,RESULT_SCHEMA);
  return json({success:true,cached:generated.cached,result:generated.result},200,headers);
}

async function astrology(body,env,headers,session,profile){
  const birthDate=validIsoDate(body.birthDate)||profile?.birth_date;
  if(!birthDate)return json({success:false,error:{code:'INVALID_BIRTH_DATE',message:'กรุณาระบุวันเดือนปีเกิด'}},400,headers);
  const suppliedTime=validTime(typeof body.birthTime==='string'?body.birthTime.trim():'');
  const birthTime=suppliedTime||profile?.birth_time||'';
  const context=memberContext(session,profile);
  const prompt=`Create a grounded astrology-inspired overview in natural Thai using birth date ${birthDate}${birthTime?`, birth time ${birthTime}`:''}. ${context} Do not invent exact planets, houses, ascendant, aspects, or astronomical positions because no ephemeris calculation is provided. Focus on reflective themes, strengths, tensions, and one useful reflection question.`;
  const generated=await generateCached(env,session,"fortune:astrology:v1",{birthDate,birthTime,profile:profileInput(profile)},"You provide astrology-inspired reflection, never fabricated astronomical calculations and never deterministic predictions.",prompt,RESULT_SCHEMA);
  return json({success:true,cached:generated.cached,result:generated.result},200,headers);
}

async function numbers(body,env,headers,session,profile){
  const rawType=typeof body.type==='string'?body.type:'';
  const type=rawType==='car'?'vehicle':(['phone','vehicle','house'].includes(rawType)?rawType:'general');
  const value=typeof body.value==='string'?body.value.trim():'';
  if(!value||value.length>80)return json({success:false,error:{code:'INVALID_VALUE',message:'กรุณาระบุข้อมูลตัวเลขที่ต้องการวิเคราะห์'}},400,headers);
  const digits=(value.match(/\d/g)||[]).join('');
  if(!digits)return json({success:false,error:{code:'INVALID_VALUE',message:'ไม่พบตัวเลขสำหรับการวิเคราะห์'}},400,headers);
  const context=memberContext(session,profile);
  const prompt=`Create a concise numerology-style reflective interpretation in natural Thai. Type: ${type}. User value: ${value}. Digits: ${digits}. ${context} Discuss symbolic themes only. Do not imply guaranteed luck, financial outcomes, safety, legal effects, or objective predictive power.`;
  const generated=await generateCached(env,session,"fortune:numbers:v1",{type,value,digits,profile:profileInput(profile)},"You provide numerology-inspired symbolic reflection for entertainment. Be specific but never deterministic.",prompt,RESULT_SCHEMA);
  return json({success:true,cached:generated.cached,result:generated.result},200,headers);
}

async function naming(body,env,headers,session,profile){
  const tone=['calm','bright','strong','creative'].includes(body.tone)?body.tone:'calm';
  const seed=typeof body.seed==='string'?body.seed.trim().slice(0,40):'';
  const purpose=typeof body.purpose==='string'?body.purpose.trim().slice(0,80):'';
  const context=memberContext(session,profile);
  const prompt=`Suggest 5 original name ideas in natural Thai or internationally readable style. Desired tone: ${tone}. Seed or preferred sound: ${seed||'none'}. Purpose/context: ${purpose||'general personal naming'}. ${context} Explain each name briefly. Avoid claims that a name guarantees luck, wealth, health, relationships, or destiny. Do not imitate trademarks or famous people.`;
  const generated=await generateCached(env,session,"fortune:naming:v1",{tone,seed,purpose,profile:profileInput(profile)},"You are a thoughtful naming assistant using symbolic and linguistic inspiration. Names are suggestions, not deterministic fortune claims.",prompt,NAMING_SCHEMA);
  return json({success:true,cached:generated.cached,result:generated.result},200,headers);
}

async function colors(body,env,headers,session,profile){
  const date=validCalendarDate(typeof body.date==='string'?body.date.trim():'');
  if(!date)return json({success:false,error:{code:'INVALID_DATE',message:'กรุณาระบุวันที่ให้ถูกต้อง'}},400,headers);
  const context=memberContext(session,profile);
  const prompt=`Create one auspicious-color-inspired reflection in natural Thai for the selected calendar date ${date}. ${context} Choose a familiar Thai color name and a valid six-digit hexadecimal color. Explain the symbolic theme and give practical, low-stakes ways to use or notice the color. Never claim the color guarantees luck, money, health, relationships, safety, or an outcome.`;
  const generated=await generateCached(env,session,"fortune:colors:v1",{date,profile:profileInput(profile)},"You provide concise color symbolism for entertainment and self-reflection. Be warm and practical, never deterministic or supernaturally certain.",prompt,COLOR_SCHEMA);
  return json({success:true,cached:generated.cached,date,result:generated.result},200,headers);
}

function memberContext(session,profile){
  if(!session)return 'The user is not signed in; use only the submitted input.';
  const bits=[];
  if(profile?.birth_date)bits.push(`saved birth date ${profile.birth_date}`);
  if(profile?.birth_time)bits.push(`saved birth time ${profile.birth_time}`);
  if(profile?.birth_place)bits.push(`saved birth place ${profile.birth_place}`);
  return bits.length?`The signed-in member also has ${bits.join(', ')}; use this only as secondary context when relevant.`:'The user is signed in but has no additional saved birth profile context.';
}
function profileInput(profile){
  if(!profile)return null;
  return {birthDate:profile.birth_date||"",birthTime:profile.birth_time||"",birthPlace:profile.birth_place||"",birthPlaceId:profile.birth_place_id||"",birthTimezone:profile.birth_timezone||profile.timezone||""};
}
async function generateCached(env,session,feature,input,system,prompt,schema){
  const cached=await getMemberAiResult(env,session?.sub||"",feature,{modelChain:geminiCacheVersion(env),...input});
  if(cached.cached)return {cached:true,result:cached.value};
  const {result}=await generateGeminiJson(env,{system,prompt,schema});
  await saveMemberAiResult(env,session?.sub||"",feature,cached.key,result);
  return {cached:false,result};
}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
