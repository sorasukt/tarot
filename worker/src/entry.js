import tarotWorker from "./index.js";
import {handleMember} from "./member.js";
import {handleAuthRoute,getSession} from "./auth-web.js";
import {handleFortune} from "./fortune.js";
import {enforceAiRateLimit} from "./rate-limit.js";
import {handleUsage,hasCurrentPolicy,loadPolicyAcceptance,purgeExpiredUserData} from "./usage.js";
import {handleBilling,handleStripeWebhook,loadMembership} from "./stripe.js";

const MAJOR=["The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers","The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance","The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"];
const RANKS=["Ace","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Page","Knight","Queen","King"];
const SUITS=["Wands","Cups","Swords","Pentacles"];
const DECK=[...MAJOR.map((name,id)=>({id,name,arcana:"major",suit:null})),...SUITS.flatMap((suit,s)=>RANKS.map((rank,r)=>({id:22+s*14+r,name:`${rank} of ${suit}`,arcana:"minor",suit:suit.toLowerCase()})))];

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname==="/api/stripe/webhook")return handleStripeWebhook(request,env);

    if(url.pathname.startsWith("/auth/")){
      try{
        const response=await handleAuthRoute(request,env);
        return response||json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,baseHeaders(request,env));
      }catch(error){
        console.error("Auth route failed",error?.message||"error");
        return json({success:false,error:{code:"AUTH_CONFIG_ERROR",message:"Authentication service is not configured"}},500,baseHeaders(request,env));
      }
    }

    if(url.pathname==="/api/usage"){
      const origin=request.headers.get("Origin")||"";
      const corsOrigin=allowedOrigin(origin,env);
      if(request.method==="OPTIONS")return preflight(corsOrigin);
      const headers=baseHeaders(request,env);
      if(origin&&!corsOrigin)return json({success:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"Origin not allowed"}},403,headers);
      let session=null;
      try{session=await getSession(request,env)}catch(error){console.error(JSON.stringify({message:"Optional usage session failed",error:error?.message||"error"}))}
      return handleUsage(request,env,headers,session);
    }

    if(url.pathname.startsWith("/api/billing/")){
      const origin=request.headers.get("Origin")||"";
      const corsOrigin=allowedOrigin(origin,env);
      if(request.method==="OPTIONS")return preflight(corsOrigin);
      const headers=baseHeaders(request,env);
      if(origin&&!corsOrigin)return json({success:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"Origin not allowed"}},403,headers);
      if((url.pathname==="/api/billing/checkout/membership"||url.pathname==="/api/billing/checkout/support")&&!hasCurrentPolicy(request))return policyRequired(headers);
      let session=null;
      try{session=await getSession(request,env)}catch(error){console.error(JSON.stringify({message:"Optional billing session failed",error:error?.message||"error"}))}
      return handleBilling(request,env,headers,session);
    }

    if(url.pathname==="/api/tarot/reading"&&request.method==="POST"){
      const origin=request.headers.get("Origin")||"";
      const corsOrigin=allowedOrigin(origin,env);
      const headers=baseHeaders(request,env);
      if(origin&&!corsOrigin)return json({success:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"Origin not allowed"}},403,headers);
      if(!hasCurrentPolicy(request))return policyRequired(headers);
      let session=null,profile=null;
      try{
        session=await getSession(request,env);
        if(session&&env.DB)profile=await loadProfile(env,session.sub);
      }catch(error){console.error(JSON.stringify({message:"Optional Tarot member context failed",error:error?.message||"error"}))}
      const limit=await enforceAiRateLimit(request,env,session?.sub||"");
      if(!limit.allowed)return limited(limit,headers);
      return tarotWorker.fetch(request,env,ctx,{session,profile});
    }

    if(url.pathname.startsWith('/api/fortune/')){
      const origin=request.headers.get('Origin')||'';
      const corsOrigin=allowedOrigin(origin,env);
      if(request.method==='OPTIONS')return preflight(corsOrigin);
      const headers=baseHeaders(request,env);
      if(origin&&!corsOrigin)return json({success:false,error:{code:'ORIGIN_NOT_ALLOWED',message:'Origin not allowed'}},403,headers);
      if(!hasCurrentPolicy(request))return policyRequired(headers);
      let session=null,profile=null;
      try{
        session=await getSession(request,env);
        if(session&&env.DB)profile=await loadProfile(env,session.sub);
      }catch(error){console.error('Optional fortune member context failed',error?.message||'error');}
      const limit=await enforceAiRateLimit(request,env,session?.sub||"");
      if(!limit.allowed)return limited(limit,headers);
      const response=await handleFortune(request,env,headers,session,profile);
      return response||json({success:false,error:{code:'NOT_FOUND',message:'Not found'}},404,headers);
    }

    if(!url.pathname.startsWith("/api/member/"))return tarotWorker.fetch(request,env,ctx);

    const origin=request.headers.get("Origin")||"";
    const corsOrigin=allowedOrigin(origin,env);
    if(request.method==="OPTIONS")return preflight(corsOrigin);

    const headers=baseHeaders(request,env);
    if(origin&&!corsOrigin)return json({success:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"Origin not allowed"}},403,headers);

    const session=await getSession(request,env);
    if(!session)return json({success:false,error:{code:"UNAUTHORIZED",message:"Authentication required"}},401,headers);
    const auth={ok:true,payload:session};

    if((url.pathname==="/api/member/daily"||url.pathname==="/api/member/astrology")&&request.method==="GET"){
      if(!hasCurrentPolicy(request))return policyRequired(headers);
      const limit=await enforceAiRateLimit(request,env,session.sub);
      if(!limit.allowed)return limited(limit,headers);
    }

    if(url.pathname==="/api/member/me"||url.pathname==="/api/member/context"){
      if(request.method!=="GET")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
      try{
        const context=await getMemberContext(env,session);
        return json({success:true,...context},200,headers);
      }catch(error){
        console.error("Member context failed",error?.message||"error");
        return json({success:false,error:{code:"MEMBER_CONTEXT_ERROR",message:"ไม่สามารถโหลดข้อมูลสมาชิกได้ในขณะนี้"}},500,headers);
      }
    }

    try{
      const response=await handleMember(request,env,headers,auth,DECK);
      return response||json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,headers);
    }catch(error){
      console.error("Member API failed",error?.message||error?.name||"error");
      return json({success:false,error:{code:"MEMBER_API_ERROR",message:"ไม่สามารถบันทึกหรือโหลดข้อมูลสมาชิกได้ในขณะนี้"}},500,headers);
    }
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(purgeExpiredUserData(env));
  }
};

async function loadProfile(env,sub){return env.DB.prepare("SELECT birth_date,birth_time,birth_place,birth_place_id,birth_lat,birth_lng,birth_timezone,timezone,created_at,updated_at FROM member_profiles WHERE user_sub=?").bind(sub).first()}
async function getMemberContext(env,session){
  const {sub,name,nickname,email,picture}=session;
  const [profile,acceptance,membership]=env.DB?await Promise.all([loadProfile(env,sub),loadPolicyAcceptance(env,sub),loadMembership(env,sub)]):[null,null,null];
  const completion={hasBirthDate:Boolean(profile?.birth_date),hasBirthTime:Boolean(profile?.birth_time),hasBirthPlace:Boolean(profile?.birth_place&&profile?.birth_place_id),readyForDaily:Boolean(profile?.birth_date),readyForDeepAstrology:Boolean(profile?.birth_date&&profile?.birth_time&&profile?.birth_place_id)};
  return {user:{sub,name,nickname,email,picture},profile:profile||null,completion,membership,policy:{accepted:Boolean(acceptance),version:acceptance?.policy_version||null,acceptedAt:acceptance?.accepted_at||null}};
}
function preflight(corsOrigin){
  if(!corsOrigin)return new Response(null,{status:403,headers:{"Cache-Control":"no-store","Vary":"Origin"}});
  const headers=new Headers();headers.set('Access-Control-Allow-Origin',corsOrigin);headers.set('Access-Control-Allow-Credentials','true');headers.set('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type, X-Tarot-Policy-Version');headers.set('Access-Control-Max-Age','86400');headers.set('Cache-Control','no-store');headers.set('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');return new Response(null,{status:204,headers});
}
function allowedOrigin(origin,env){const allowed=(env.ALLOWED_ORIGINS||"https://sorasukt.com,https://www.sorasukt.com").split(",").map(x=>x.trim()).filter(Boolean);return allowed.includes(origin)?origin:""}
function baseHeaders(request,env){const origin=request.headers.get("Origin")||"",corsOrigin=allowedOrigin(origin,env),headers=new Headers();headers.set("Content-Type","application/json; charset=utf-8");headers.set("Cache-Control","no-store");headers.set("Vary","Origin");if(corsOrigin){headers.set("Access-Control-Allow-Origin",corsOrigin);headers.set("Access-Control-Allow-Credentials","true");}return headers}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
function limited(result,headers){const responseHeaders=new Headers(headers);if(result.retryAfter)responseHeaders.set("Retry-After",String(result.retryAfter));return json({success:false,error:{code:result.code,message:result.message}},result.status,responseHeaders)}
function policyRequired(headers){return json({success:false,error:{code:"POLICY_ACCEPTANCE_REQUIRED",message:"กรุณายอมรับนโยบายก่อนใช้งาน"}},428,headers)}
