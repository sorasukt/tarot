import {readJsonBody,RequestBodyError} from "./request.js";
import {adminAccess} from "./admin.js";

const PERIODS=new Set(["weekly","monthly","yearly"]);
const STRIPE_API="https://api.stripe.com/v1";

export async function handleRedeemAdmin(request,env,headers,session){
  const url=new URL(request.url);
  if(url.pathname!=="/api/admin/redeem-codes")return null;
  if(!session)return json({success:false,error:{code:"UNAUTHORIZED",message:"Authentication required"}},401,headers);
  const access=adminAccess(session);
  if(!access.roles.some(role=>role==="admin"||role==="billing"))return json({success:false,error:{code:"FORBIDDEN",message:"Admin or billing role required"}},403,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"Storage is not configured"}},503,headers);

  try{
    if(request.method==="GET"){
      const limit=clamp(url.searchParams.get("limit"),1,100,50);
      if(url.searchParams.get("source")==="stripe")return listStripeCodes(env,headers,limit);
      const rows=await env.DB.prepare("SELECT code,plan_period,status,expires_at,used_by,used_at,note,created_at,updated_at FROM redeem_codes ORDER BY created_at DESC LIMIT ?").bind(limit).all();
      return json({success:true,codes:(rows.results||[]).map(row=>publicCode(row,env,"local"))},200,headers);
    }
    if(request.method==="POST"){
      const body=await readJsonBody(request,4_096);
      const plan=normalizePlan(body?.plan);
      if(!plan)return json({success:false,error:{code:"INVALID_PLAN",message:"Plan must be weekly, monthly, or yearly"}},400,headers);
      const code=normalizeCode(body?.code)||generateCode(plan);
      const expiresAt=normalizeDate(body?.expiresAt);
      const note=typeof body?.note==="string"?body.note.trim().slice(0,500):null;
      if(body?.source==="stripe")return createStripeCode(env,headers,{code,plan,expiresAt,note});
      await insertLocalCode(env,{code,plan,expiresAt,note});
      return json({success:true,redeem:{code,plan,expiresAt,source:"local",redeemUrl:redeemUrl(env,code,plan)}},201,headers);
    }
    return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  }catch(error){
    console.error(JSON.stringify({message:"Redeem admin route failed",error:error?.name||"error",status:error?.status||null}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"Invalid request body"}},error.status,headers);
    if(error instanceof StripeRedeemError)return json({success:false,error:{code:error.code,message:error.publicMessage}},error.status,headers);
    if(String(error?.message||"").toLowerCase().includes("unique"))return json({success:false,error:{code:"CODE_EXISTS",message:"Redeem code already exists"}},409,headers);
    return json({success:false,error:{code:"REDEEM_ADMIN_ERROR",message:"Unable to manage redeem codes"}},500,headers);
  }
}

async function listStripeCodes(env,headers,limit){
  assertStripe(env);
  const list=await stripe(env,`/promotion_codes?limit=${limit}`);
  const codes=(Array.isArray(list?.data)?list.data:[]).map(item=>{
    const plan=normalizePlan(item?.metadata?.plan_period||item?.metadata?.plan||"");
    return {
      id:item.id||null,
      code:String(item.code||"").toUpperCase(),
      plan_period:plan||null,
      status:item.active===false?"disabled":item.expires_at&&item.expires_at*1000<=Date.now()?"expired":"active",
      expires_at:item.expires_at?new Date(item.expires_at*1000).toISOString():null,
      times_redeemed:Number(item.times_redeemed||0),
      max_redemptions:item.max_redemptions??null,
      created_at:item.created?new Date(item.created*1000).toISOString():null,
      source:"stripe",
      redeemUrl:plan&&item.code?redeemUrl(env,String(item.code).toUpperCase(),plan):null
    };
  });
  return json({success:true,codes},200,headers);
}

async function createStripeCode(env,headers,{code,plan,expiresAt,note}){
  assertStripe(env);
  const couponParams=new URLSearchParams();
  couponParams.set("percent_off","100");
  couponParams.set("duration","once");
  couponParams.set("name",`Tarot Redeem ${plan}`);
  couponParams.set("metadata[app]","tarot_redeem");
  couponParams.set("metadata[plan_period]",plan);
  couponParams.set("metadata[payment_type]","redeem");
  if(note)couponParams.set("metadata[note]",note.slice(0,450));
  const coupon=await stripe(env,"/coupons",{method:"POST",body:couponParams});

  const promoParams=new URLSearchParams();
  promoParams.set("promotion[type]","coupon");
  promoParams.set("promotion[coupon]",coupon.id);
  promoParams.set("code",code);
  promoParams.set("max_redemptions","1");
  promoParams.set("metadata[app]","tarot_redeem");
  promoParams.set("metadata[plan_period]",plan);
  promoParams.set("metadata[payment_type]","redeem");
  if(note)promoParams.set("metadata[note]",note.slice(0,450));
  if(expiresAt)promoParams.set("expires_at",String(Math.floor(new Date(expiresAt).getTime()/1000)));
  const promotion=await stripe(env,"/promotion_codes",{method:"POST",body:promoParams});

  const stripeCode=normalizeCode(promotion.code)||code;
  try{await insertLocalCode(env,{code:stripeCode,plan,expiresAt,note:note?`Stripe: ${note}`:"Stripe promotion code"})}
  catch(error){
    console.error(JSON.stringify({message:"Stripe redeem code created but local mirror failed",promotionCodeId:promotion.id||null,error:error?.message||"error"}));
    throw error;
  }
  return json({success:true,redeem:{id:promotion.id||null,code:stripeCode,plan,expiresAt,source:"stripe",redeemUrl:redeemUrl(env,stripeCode,plan)}},201,headers);
}

async function insertLocalCode(env,{code,plan,expiresAt,note}){
  await env.DB.prepare("INSERT INTO redeem_codes(code,plan_period,status,expires_at,note) VALUES(?,?,'active',?,?)").bind(code,plan,expiresAt,note||null).run();
}

async function stripe(env,path,{method="GET",body=null}={}){
  assertStripe(env);
  const requestHeaders={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,Accept:"application/json"};
  if(body)requestHeaders["Content-Type"]="application/x-www-form-urlencoded";
  const response=await fetch(`${STRIPE_API}${path}`,{method,headers:requestHeaders,body:body?body.toString():undefined});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok){
    console.error(JSON.stringify({message:"Stripe redeem admin request failed",path,status:response.status,type:data?.error?.type||null,code:data?.error?.code||null}));
    throw new StripeRedeemError(response.status>=500?502:response.status,"STRIPE_REDEEM_ERROR",data?.error?.message||"Stripe ไม่สามารถดำเนินการโค้ดได้");
  }
  return data;
}

function publicCode(row,env,source){return {...row,source,redeemUrl:redeemUrl(env,row.code,row.plan_period)}}
function redeemUrl(env,code,plan){return `${siteUrl(env)}/redeem/?code=${encodeURIComponent(code)}&plan=${encodeURIComponent(plan)}`}
function normalizePlan(value){const raw=String(value||"").trim().toLowerCase();const aliases={week:"weekly",weekly:"weekly",month:"monthly",monthly:"monthly",year:"yearly",annual:"yearly",yearly:"yearly"};const plan=aliases[raw]||"";return PERIODS.has(plan)?plan:""}
function normalizeCode(value){const code=String(value||"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9-]{5,63}$/.test(code)?code:""}
function normalizeDate(value){if(value==null||value==="")return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString()}
function generateCode(plan){const prefix=plan==="weekly"?"WEEK":plan==="monthly"?"MONTH":"YEAR";const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);const token=[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();return `${prefix}-${token}`}
function siteUrl(env){return (env.SITE_URL||"https://sorasukt.com").replace(/\/$/,"")}
function assertStripe(env){if(!env.STRIPE_SECRET_KEY)throw new StripeRedeemError(503,"STRIPE_NOT_CONFIGURED","Stripe ยังไม่ได้ตั้งค่าสำหรับระบบ Redeem")}
function clamp(value,min,max,fallback){const n=Number(value);return Number.isInteger(n)?Math.min(max,Math.max(min,n)):fallback}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
class StripeRedeemError extends Error{constructor(status,code,publicMessage){super(code);this.name="StripeRedeemError";this.status=status;this.code=code;this.publicMessage=publicMessage}}
