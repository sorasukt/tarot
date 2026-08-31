import {readJsonBody,RequestBodyError} from "./request.js";

const CODE_RE=/^[A-Z0-9][A-Z0-9_-]{5,63}$/;
const PERIODS=new Set(["weekly","monthly","yearly"]);

export async function handleRedeem(request,env,headers,session){
  const url=new URL(request.url);
  if(url.pathname!=="/api/redeem")return null;
  if(!session)return json({success:false,error:{code:"UNAUTHORIZED",message:"กรุณาลงชื่อใช้งานก่อนใช้โค้ด"}},401,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"ระบบแลกสิทธิ์ยังไม่พร้อมใช้งาน"}},503,headers);

  try{
    if(request.method==="GET")return preview(url,env,headers);
    if(request.method==="POST")return redeem(request,env,headers,session);
    return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  }catch(error){
    console.error(JSON.stringify({message:"Redeem route failed",error:error?.name||"error"}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);
    return json({success:false,error:{code:"REDEEM_ERROR",message:"ไม่สามารถใช้โค้ดได้ในขณะนี้ กรุณาลองอีกครั้ง"}},500,headers);
  }
}

async function preview(url,env,headers){
  const code=normalizeCode(url.searchParams.get("code"));
  if(!code)return invalidCode(headers);
  const row=await env.DB.prepare("SELECT plan_period,status,expires_at FROM redeem_codes WHERE code=?").bind(code).first();
  if(!row)return invalidCode(headers);
  const availability=codeAvailability(row);
  if(!availability.ok)return json({success:false,error:{code:availability.code,message:availability.message}},availability.status,headers);
  return json({success:true,redeem:{plan:row.plan_period,expiresAt:row.expires_at||null}},200,headers);
}

async function redeem(request,env,headers,session){
  const body=await readJsonBody(request,4_096);
  const code=normalizeCode(body?.code);
  const requestedPlan=normalizePlan(body?.plan);
  if(!code)return invalidCode(headers);

  const row=await env.DB.prepare("SELECT code,plan_period,status,expires_at FROM redeem_codes WHERE code=?").bind(code).first();
  if(!row)return invalidCode(headers);
  const availability=codeAvailability(row);
  if(!availability.ok)return json({success:false,error:{code:availability.code,message:availability.message}},availability.status,headers);
  if(requestedPlan&&requestedPlan!==row.plan_period)return json({success:false,error:{code:"PLAN_MISMATCH",message:"โค้ดนี้ไม่ตรงกับแผนที่ระบุในลิงก์"}},409,headers);

  const existing=await env.DB.prepare("SELECT stripe_subscription_id,status,current_period_end FROM tarot_memberships WHERE user_sub=?").bind(session.sub).first();
  if(existing?.stripe_subscription_id&&membershipActive(existing)){
    return json({success:false,error:{code:"ACTIVE_SUBSCRIPTION",message:"บัญชีนี้มี Subscription ที่ใช้งานอยู่แล้ว กรุณาจัดการสมาชิกปัจจุบันก่อนใช้โค้ด"}},409,headers);
  }

  const claim=await env.DB.prepare("UPDATE redeem_codes SET status='redeemed',used_by=?,used_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE code=? AND status='active' AND (expires_at IS NULL OR datetime(expires_at)>CURRENT_TIMESTAMP)").bind(session.sub,code).run();
  if(!claim.meta?.changes)return json({success:false,error:{code:"CODE_UNAVAILABLE",message:"โค้ดนี้ถูกใช้แล้ว หมดอายุ หรือไม่พร้อมใช้งาน"}},409,headers);

  const modifier=periodModifier(row.plan_period);
  const current=await env.DB.prepare("SELECT current_period_end FROM tarot_memberships WHERE user_sub=?").bind(session.sub).first();
  const base=current?.current_period_end&&Date.parse(current.current_period_end)>Date.now()?current.current_period_end:null;
  const end=await env.DB.prepare(`SELECT datetime(COALESCE(?,CURRENT_TIMESTAMP),?) AS value`).bind(base,modifier).first();

  await env.DB.prepare(`INSERT INTO tarot_memberships(user_sub,plan_period,payment_type,status,current_period_end,cancel_at_period_end,created_at,updated_at)
    VALUES(?,?,'redeem','active',?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(user_sub) DO UPDATE SET plan_period=excluded.plan_period,payment_type='redeem',status='active',current_period_end=excluded.current_period_end,cancel_at_period_end=0,updated_at=CURRENT_TIMESTAMP`)
    .bind(session.sub,row.plan_period,end?.value||null).run();

  return json({success:true,redeem:{plan:row.plan_period,currentPeriodEnd:end?.value||null}},200,headers);
}

function normalizeCode(value){const code=String(value||"").trim().toUpperCase();return CODE_RE.test(code)?code:""}
function normalizePlan(value){const raw=String(value||"").trim().toLowerCase();const aliases={week:"weekly",weekly:"weekly",month:"monthly",monthly:"monthly",year:"yearly",annual:"yearly",yearly:"yearly"};const plan=aliases[raw]||"";return PERIODS.has(plan)?plan:""}
function periodModifier(period){return period==="weekly"?"+7 days":period==="monthly"?"+1 month":"+1 year"}
function codeAvailability(row){if(row.status==="redeemed")return {ok:false,status:409,code:"CODE_USED",message:"โค้ดนี้ถูกใช้แล้ว"};if(row.status!=="active")return {ok:false,status:410,code:"CODE_DISABLED",message:"โค้ดนี้ไม่พร้อมใช้งาน"};if(row.expires_at&&Date.parse(row.expires_at)<=Date.now())return {ok:false,status:410,code:"CODE_EXPIRED",message:"โค้ดนี้หมดอายุแล้ว"};return {ok:true}}
function membershipActive(row){if(!["active","trialing"].includes(row?.status))return false;if(!row.current_period_end)return true;return Date.parse(row.current_period_end)>Date.now()}
function invalidCode(headers){return json({success:false,error:{code:"INVALID_CODE",message:"ไม่พบโค้ดนี้ หรือรูปแบบโค้ดไม่ถูกต้อง"}},404,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
