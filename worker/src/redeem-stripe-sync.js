const PERIODS=new Set(["weekly","monthly","yearly"]);
const STRIPE_API="https://api.stripe.com/v1";

export async function syncExistingStripePromotionCode(env,body){
  const id=String(body?.promotionCodeId||"").trim();
  if(!/^promo_[A-Za-z0-9]+$/.test(id))return fail(400,"INVALID_PROMOTION_CODE","Stripe Promotion Code ไม่ถูกต้อง");
  if(!env.STRIPE_SECRET_KEY)return fail(503,"STRIPE_NOT_CONFIGURED","Stripe ยังไม่ได้ตั้งค่าสำหรับระบบ Redeem");

  const response=await fetch(`${STRIPE_API}/promotion_codes/${encodeURIComponent(id)}`,{
    headers:{Authorization:["Bearer",env.STRIPE_SECRET_KEY].join(" "),Accept:"application/json"}
  });
  let promotion={};
  try{promotion=await response.json()}catch{}
  if(!response.ok)return fail(response.status>=500?502:response.status,"STRIPE_REDEEM_ERROR",promotion?.error?.message||"Stripe ไม่สามารถอ่าน Promotion Code ได้");

  const code=normalizeCode(promotion?.code);
  if(!code)return fail(400,"INVALID_CODE","Promotion Code นี้ไม่มีโค้ดที่ใช้กับ Redeem ได้");
  if(promotion.active===false)return fail(409,"CODE_DISABLED","Promotion Code นี้ถูกปิดใช้งานใน Stripe");
  if(promotion.expires_at&&promotion.expires_at*1000<=Date.now())return fail(409,"CODE_EXPIRED","Promotion Code นี้หมดอายุแล้ว");
  if(Number(promotion.times_redeemed||0)>0)return fail(409,"CODE_ALREADY_USED_IN_STRIPE","Promotion Code นี้ถูกใช้ใน Stripe แล้ว ไม่สามารถนำมา Redeem ซ้ำได้");

  const plan=normalizePlan(body?.plan)||normalizePlan(promotion?.metadata?.plan_period||promotion?.metadata?.plan||"");
  if(!plan)return fail(400,"INVALID_PLAN","กรุณาเลือกระยะเวลาสิทธิ์ Weekly, Monthly หรือ Yearly ก่อน Sync");

  const existing=await env.DB.prepare("SELECT code,plan_period,status FROM redeem_codes WHERE code=?").bind(code).first();
  if(existing)return {status:200,data:{success:true,redeem:{code,plan:existing.plan_period,status:existing.status,source:"stripe",synced:true,alreadySynced:true,redeemUrl:redeemUrl(env,code,existing.plan_period)}}};

  const expiresAt=promotion.expires_at?new Date(promotion.expires_at*1000).toISOString():null;
  await env.DB.prepare("INSERT INTO redeem_codes(code,plan_period,status,expires_at,note) VALUES(?,?,'active',?,?)").bind(code,plan,expiresAt,`Synced from Stripe ${id}`).run();
  return {status:201,data:{success:true,redeem:{id,code,plan,expiresAt,source:"stripe",synced:true,alreadySynced:false,redeemUrl:redeemUrl(env,code,plan)}}};
}

function redeemUrl(env,code,plan){const base=(env.SITE_URL||"https://sorasukt.com").replace(/\/$/,"");const tarot=/\/tarot$/i.test(base)?base:`${base}/tarot`;return `${tarot}/redeem/?code=${encodeURIComponent(code)}&plan=${encodeURIComponent(plan)}`}
function normalizeCode(value){const code=String(value||"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9_-]{5,63}$/.test(code)?code:""}
function normalizePlan(value){const raw=String(value||"").trim().toLowerCase();const aliases={week:"weekly",weekly:"weekly",month:"monthly",monthly:"monthly",year:"yearly",annual:"yearly",yearly:"yearly"};const plan=aliases[raw]||"";return PERIODS.has(plan)?plan:""}
function fail(status,code,message){return {status,data:{success:false,error:{code,message}}}}
