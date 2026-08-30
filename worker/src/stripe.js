import {readJsonBody,readTextBody,RequestBodyError} from "./request.js";

const PERIODS=new Set(["weekly","monthly","yearly"]);
const PAYMENT_TYPES=new Set(["subscription","one_time"]);
const RETRY_SAFE_ID=/^[0-9a-f-]{16,64}$/i;
const SESSION_ID=/^cs_(test_|live_)?[A-Za-z0-9_]+$/;
const STRIPE_API="https://api.stripe.com/v1";
const MEMBERSHIP_PRICING={
  subscription:{weekly:{amount:5_900,interval:"week"},monthly:{amount:19_900,interval:"month"},yearly:{amount:169_000,interval:"year"}},
  one_time:{weekly:{amount:7_900},monthly:{amount:25_900},yearly:{amount:179_000}}
};

class StripeApiError extends Error{
  constructor(status,code="STRIPE_ERROR"){super(`Stripe request failed with status ${status}`);this.name="StripeApiError";this.status=status;this.code=code}
}

export async function handleBilling(request,env,headers,session=null){
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/billing/plans"){
      if(request.method!=="GET")return methodNotAllowed(headers);
      return plans(env,headers);
    }
    if(url.pathname==="/api/billing/session"){
      if(request.method!=="GET")return methodNotAllowed(headers);
      return checkoutResult(url,env,headers,session);
    }
    if(url.pathname==="/api/billing/status"){
      if(request.method!=="GET")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return membershipStatus(env,headers,session.sub,url.searchParams.get("refresh")==="1");
    }
    if(url.pathname==="/api/billing/checkout/membership"){
      if(request.method!=="POST")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return membershipCheckout(request,env,headers,session);
    }
    if(url.pathname==="/api/billing/checkout/support"){
      if(request.method!=="POST")return methodNotAllowed(headers);
      return supportCheckout(request,env,headers,session);
    }
    if(url.pathname==="/api/billing/portal"){
      if(request.method!=="POST")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return customerPortal(env,headers,session);
    }
    return json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,headers);
  }catch(error){
    console.error(JSON.stringify({message:"Stripe billing route failed",path:url.pathname,error:error?.name||"error",code:error?.code||null,status:error?.status||null}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:error.status===413?"ข้อมูลคำขอมีขนาดใหญ่เกินไป":"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);
    if(error instanceof StripeApiError){
      if(error.code==="STRIPE_NOT_CONFIGURED")return json({success:false,error:{code:"PAYMENT_NOT_CONFIGURED",message:"ระบบชำระเงินยังไม่พร้อมใช้งาน"}},503,headers);
      if(error.code==="PRICE_CONFIGURATION_INVALID")return json({success:false,error:{code:"PLAN_NOT_CONFIGURED",message:"ราคาของแผนนี้ยังตั้งค่าไม่สมบูรณ์"}},503,headers);
      return json({success:false,error:{code:"PAYMENT_PROVIDER_ERROR",message:"ไม่สามารถเชื่อมต่อระบบชำระเงินได้ในขณะนี้ กรุณาลองอีกครั้ง"}},502,headers);
    }
    return json({success:false,error:{code:"BILLING_ERROR",message:"ไม่สามารถดำเนินการชำระเงินได้ในขณะนี้"}},500,headers);
  }
}

export async function handleStripeWebhook(request,env){
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
  if(request.method!=="POST")return methodNotAllowed(headers);
  if(!env.STRIPE_WEBHOOK_SECRET)return json({success:false,error:{code:"WEBHOOK_NOT_CONFIGURED",message:"Webhook is not configured"}},503,headers);
  let raw;
  try{raw=await readTextBody(request,256_000)}
  catch(error){return json({success:false,error:{code:error.code||"INVALID_WEBHOOK",message:"Invalid webhook payload"}},error.status||400,headers)}
  if(!await verifyStripeSignature(raw,request.headers.get("Stripe-Signature")||"",env.STRIPE_WEBHOOK_SECRET))return json({success:false,error:{code:"INVALID_SIGNATURE",message:"Invalid webhook signature"}},400,headers);
  let event;
  try{event=JSON.parse(raw)}catch{return json({success:false,error:{code:"INVALID_WEBHOOK",message:"Invalid webhook payload"}},400,headers)}
  if(!event?.id||!event?.type||!event?.data?.object)return json({success:false,error:{code:"INVALID_WEBHOOK",message:"Invalid webhook event"}},400,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"Storage is not configured"}},503,headers);
  const claimed=await env.DB.prepare("INSERT OR IGNORE INTO stripe_webhook_events(event_id,event_type,status) VALUES(?,?,'processing')").bind(event.id,event.type).run();
  if(!claimed.meta?.changes)return json({success:true,duplicate:true},200,headers);
  try{
    await processStripeEvent(event,env);
    await env.DB.prepare("UPDATE stripe_webhook_events SET status='processed',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(event.id).run();
    return json({success:true},200,headers);
  }catch(error){
    await env.DB.prepare("DELETE FROM stripe_webhook_events WHERE event_id=? AND status='processing'").bind(event.id).run();
    console.error(JSON.stringify({message:"Stripe webhook processing failed",eventId:event.id,eventType:event.type,error:error?.name||"error"}));
    return json({success:false,error:{code:"WEBHOOK_PROCESSING_FAILED",message:"Webhook processing failed"}},500,headers);
  }
}

export async function verifyStripeSignature(payload,header,secret,nowSeconds=Math.floor(Date.now()/1000)){
  if(!payload||!header||!secret)return false;
  const parts=header.split(",").map(part=>part.trim().split("="));
  const timestamp=Number(parts.find(([key])=>key==="t")?.[1]);
  const signatures=parts.filter(([key])=>key==="v1").map(([,value])=>value).filter(Boolean);
  if(!Number.isFinite(timestamp)||Math.abs(nowSeconds-timestamp)>300||!signatures.length)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected=[...new Uint8Array(signed)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  return signatures.some(signature=>timingSafeEqual(signature,expected));
}

export async function loadMembership(env,userSub){
  if(!env.DB||!userSub)return null;
  const membership=await env.DB.prepare("SELECT plan_period,payment_type,status,current_period_end,cancel_at_period_end,updated_at FROM tarot_memberships WHERE user_sub=?").bind(userSub).first();
  return publicMembership(membership);
}

async function plans(env,headers){
  assertStripe(env);
  const configured=planConfiguration(env);
  const entries=await Promise.all(configured.map(async plan=>{
    const expected=expectedMembershipPrice(plan.period,plan.paymentType);
    if(!plan.priceId)return {period:plan.period,paymentType:plan.paymentType,configured:false,active:false,amount:expected.amount,currency:"thb"};
    const price=await stripeRequest(env,`/prices/${encodeURIComponent(plan.priceId)}`);
    const valid=validMembershipPrice(price,plan.period,plan.paymentType);
    return {period:plan.period,paymentType:plan.paymentType,configured:valid,amount:expected.amount,currency:"thb",recurring:price.recurring?{interval:price.recurring.interval,intervalCount:price.recurring.interval_count}:null,active:Boolean(price.active)&&valid};
  }));
  return json({success:true,plans:entries},200,headers);
}

async function membershipCheckout(request,env,headers,session){
  assertStripe(env);assertDb(env);
  const body=await readJsonBody(request,4_096);
  const period=PERIODS.has(body?.period)?body.period:"";
  const paymentType=PAYMENT_TYPES.has(body?.paymentType)?body.paymentType:"";
  const requestId=validRequestId(body?.requestId);
  if(!period||!paymentType||!requestId)return json({success:false,error:{code:"INVALID_CHECKOUT",message:"กรุณาเลือกแผนและรูปแบบการชำระเงินให้ถูกต้อง"}},400,headers);
  const priceId=membershipPriceId(env,period,paymentType);
  if(!priceId)return json({success:false,error:{code:"PLAN_NOT_CONFIGURED",message:"แผนนี้ยังไม่พร้อมรับชำระเงิน"}},503,headers);
  const price=await stripeRequest(env,`/prices/${encodeURIComponent(priceId)}`);
  if(!validMembershipPrice(price,period,paymentType))throw new StripeApiError(503,"PRICE_CONFIGURATION_INVALID");
  if(paymentType==="subscription"){
    const current=await env.DB.prepare("SELECT stripe_subscription_id,status FROM tarot_memberships WHERE user_sub=?").bind(session.sub).first();
    if(current?.stripe_subscription_id&&!['canceled','incomplete_expired'].includes(current.status))return json({success:false,error:{code:"MANAGE_EXISTING_SUBSCRIPTION",message:"คุณมี Subscription อยู่แล้ว กรุณาเปลี่ยนแพ็กเกจหรือยกเลิกจากหน้า ฉัน"}},409,headers);
  }
  const customerId=await getOrCreateCustomer(env,session);
  const params=new URLSearchParams();
  params.set("mode",paymentType==="subscription"?"subscription":"payment");
  if(paymentType==="subscription")params.set("excluded_payment_method_types[0]","promptpay");
  params.set("customer",customerId);
  params.set("client_reference_id",session.sub);
  params.set("line_items[0][price]",priceId);
  params.set("line_items[0][quantity]","1");
  params.set("allow_promotion_codes","true");
  params.set("success_url",`${siteUrl(env)}/tarot/billing/success/?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url",`${siteUrl(env)}/tarot/membership/?canceled=1`);
  params.set("locale","auto");
  params.set("metadata[kind]","membership");
  params.set("metadata[user_sub]",session.sub);
  params.set("metadata[period]",period);
  params.set("metadata[payment_type]",paymentType);
  if(paymentType==="subscription"){
    params.set("subscription_data[metadata][user_sub]",session.sub);
    params.set("subscription_data[metadata][period]",period);
  }else{
    params.set("invoice_creation[enabled]","true");
    params.set("payment_intent_data[metadata][user_sub]",session.sub);
    params.set("payment_intent_data[metadata][period]",period);
    params.set("payment_intent_data[metadata][kind]","membership");
  }
  const idempotencyKey=`membership-${await sha256(`${session.sub}:${requestId}`)}`;
  const checkout=await stripeRequest(env,"/checkout/sessions",{method:"POST",body:params,idempotencyKey});
  return checkoutUrl(checkout,headers);
}

async function supportCheckout(request,env,headers,session){
  assertStripe(env);
  const body=await readJsonBody(request,4_096);
  const amount=Number(body?.amount);
  const requestId=validRequestId(body?.requestId);
  if(!Number.isInteger(amount)||amount<50||amount>100000||!requestId||body?.accepted!==true)return json({success:false,error:{code:"INVALID_SUPPORT_PAYMENT",message:"กรุณาระบุจำนวนเงิน 50–100,000 บาทและยอมรับเงื่อนไข"}},400,headers);
  const params=new URLSearchParams();
  params.set("mode","payment");
  params.set("line_items[0][price_data][currency]","thb");
  params.set("line_items[0][price_data][unit_amount]",String(amount*100));
  params.set("line_items[0][price_data][product_data][name]","สนับสนุน sorasukt Tarot");
  params.set("line_items[0][quantity]","1");
  params.set("billing_address_collection","required");
  params.set("shipping_address_collection[allowed_countries][0]","TH");
  params.set("phone_number_collection[enabled]","true");
  params.set("customer_creation","always");
  params.set("invoice_creation[enabled]","true");
  params.set("submit_type","donate");
  params.set("locale","auto");
  params.set("success_url",`${siteUrl(env)}/tarot/billing/success/?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url",`${siteUrl(env)}/tarot/support/?canceled=1`);
  params.set("metadata[kind]","support");
  params.set("metadata[requires_shipping]","true");
  params.set("payment_intent_data[metadata][kind]","support");
  if(session?.sub){params.set("client_reference_id",session.sub);params.set("metadata[user_sub]",session.sub);params.set("payment_intent_data[metadata][user_sub]",session.sub)}
  if(session?.email)params.set("customer_email",session.email);
  const actor=session?.sub||"guest";
  const idempotencyKey=`support-${await sha256(`${actor}:${requestId}`)}`;
  const checkout=await stripeRequest(env,"/checkout/sessions",{method:"POST",body:params,idempotencyKey});
  return checkoutUrl(checkout,headers);
}

async function customerPortal(env,headers,session){
  assertStripe(env);assertDb(env);
  const row=await env.DB.prepare("SELECT stripe_customer_id FROM stripe_customers WHERE user_sub=?").bind(session.sub).first();
  if(!row?.stripe_customer_id)return json({success:false,error:{code:"CUSTOMER_NOT_FOUND",message:"ยังไม่พบข้อมูลการชำระเงินของบัญชีนี้"}},404,headers);
  const params=new URLSearchParams({customer:row.stripe_customer_id,return_url:`${siteUrl(env)}/tarot/me/?billing=updated`});
  if(typeof env.STRIPE_PORTAL_CONFIGURATION_ID==="string"&&/^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID))params.set("configuration",env.STRIPE_PORTAL_CONFIGURATION_ID);
  const portal=await stripeRequest(env,"/billing_portal/sessions",{method:"POST",body:params});
  if(typeof portal.url!=="string"||!portal.url.startsWith("https://billing.stripe.com/"))throw new StripeApiError(502,"INVALID_PORTAL_URL");
  return json({success:true,url:portal.url},200,headers);
}

async function membershipStatus(env,headers,userSub,refresh=false){
  assertDb(env);
  if(refresh)await refreshSubscription(env,userSub);
  return json({success:true,membership:await loadMembership(env,userSub)},200,headers);
}

async function refreshSubscription(env,userSub){
  const row=await env.DB.prepare("SELECT stripe_subscription_id,payment_type FROM tarot_memberships WHERE user_sub=?").bind(userSub).first();
  if(row?.payment_type!=="subscription"||!row.stripe_subscription_id)return;
  const subscription=await stripeRequest(env,`/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}?expand[]=items.data.price`);
  await syncSubscription(env,subscription);
}

async function checkoutResult(url,env,headers,session){
  assertStripe(env);
  const sessionId=url.searchParams.get("session_id")||"";
  if(!SESSION_ID.test(sessionId))return json({success:false,error:{code:"INVALID_SESSION",message:"ไม่พบรายการชำระเงิน"}},400,headers);
  const query=new URLSearchParams();query.append("expand[]","payment_intent.latest_charge");query.append("expand[]","invoice");
  const checkout=await stripeRequest(env,`/checkout/sessions/${encodeURIComponent(sessionId)}?${query}`);
  const kind=checkout.metadata?.kind||"payment",owner=checkout.metadata?.user_sub||checkout.client_reference_id||"";
  if(kind==="membership"&&(!session||owner!==session.sub))return unauthorized(headers);
  const paymentIntent=await expandedPaymentIntent(env,checkout.payment_intent);
  const invoice=await expandedInvoice(env,checkout.invoice);
  const receiptUrl=safeStripeDocumentUrl(paymentIntent?.latest_charge?.receipt_url||invoice?.hosted_invoice_url||"");
  const membership=session&&env.DB?(await env.DB.prepare("SELECT plan_period,payment_type,status,current_period_end,cancel_at_period_end,updated_at FROM tarot_memberships WHERE user_sub=?").bind(session.sub).first()):null;
  return json({success:true,session:{id:checkout.id,kind,paymentStatus:checkout.payment_status||"unpaid",status:checkout.status||"open",amountTotal:checkout.amount_total??null,currency:checkout.currency||null,receiptUrl,membership:publicMembership(membership)}},200,headers);
}

async function processStripeEvent(event,env){
  const object=event.data.object;
  if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)){
    await recordCheckout(object,env,event.type.endsWith("succeeded")?"paid":object.payment_status||"unpaid");
    if(object.metadata?.kind==="membership"&&object.metadata?.payment_type==="one_time"&&(object.payment_status==="paid"||event.type.endsWith("succeeded")))await activateOneTime(env,object.metadata.user_sub,object.metadata.period,object);
    if(object.metadata?.kind==="membership"&&object.metadata?.payment_type==="subscription"&&object.subscription){const subscription=await stripeRequest(env,`/subscriptions/${encodeURIComponent(idOf(object.subscription))}`);await syncSubscription(env,subscription)}
    return;
  }
  if(event.type==="checkout.session.async_payment_failed"){await recordCheckout(object,env,"failed");return}
  if(event.type==="checkout.session.expired"){await recordCheckout(object,env,"expired");return}
  if(event.type.startsWith("customer.subscription.")){await syncSubscription(env,object);return}
  if(["invoice.paid","invoice.payment_action_required","invoice.payment_failed"].includes(event.type)&&subscriptionIdFromInvoice(object)){const subscription=await stripeRequest(env,`/subscriptions/${encodeURIComponent(subscriptionIdFromInvoice(object))}`);await syncSubscription(env,subscription);return}
  if(event.type==="invoice.payment_failed"){await env.DB.prepare("UPDATE tarot_memberships SET status='past_due',updated_at=CURRENT_TIMESTAMP WHERE stripe_customer_id=?").bind(idOf(object.customer)).run();return}
  if((event.type==="charge.succeeded"||event.type==="charge.updated")&&object.payment_intent){await env.DB.prepare("UPDATE stripe_payments SET receipt_url=?,updated_at=CURRENT_TIMESTAMP WHERE stripe_payment_intent_id=?").bind(safeStripeDocumentUrl(object.receipt_url||""),idOf(object.payment_intent)).run()}
}

async function recordCheckout(checkout,env,status){
  const kind=checkout.metadata?.kind||"payment";
  await env.DB.prepare(`INSERT INTO stripe_payments(stripe_checkout_session_id,user_sub,kind,stripe_customer_id,stripe_payment_intent_id,amount,currency,payment_status,reward_fulfillment_status,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(stripe_checkout_session_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_payment_intent_id=excluded.stripe_payment_intent_id,amount=excluded.amount,currency=excluded.currency,payment_status=excluded.payment_status,updated_at=CURRENT_TIMESTAMP`)
    .bind(checkout.id,checkout.metadata?.user_sub||checkout.client_reference_id||null,kind,idOf(checkout.customer)||null,idOf(checkout.payment_intent)||null,checkout.amount_total??null,checkout.currency||null,status,kind==="support"?"pending":"not_applicable").run();
}

async function activateOneTime(env,userSub,period,checkout){
  if(!userSub||!PERIODS.has(period))return;
  const existing=await env.DB.prepare("SELECT current_period_end FROM tarot_memberships WHERE user_sub=?").bind(userSub).first();
  const current=existing?.current_period_end?new Date(existing.current_period_end):null;
  const base=current&&!Number.isNaN(current.valueOf())&&current>new Date()?current:new Date();
  const expiry=addPeriod(base,period).toISOString();
  await env.DB.prepare(`INSERT INTO tarot_memberships(user_sub,stripe_customer_id,plan_period,payment_type,status,current_period_end,stripe_checkout_session_id,cancel_at_period_end,updated_at)
    VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_sub) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,plan_period=excluded.plan_period,payment_type='one_time',status='active',current_period_end=excluded.current_period_end,stripe_checkout_session_id=excluded.stripe_checkout_session_id,cancel_at_period_end=0,updated_at=CURRENT_TIMESTAMP`)
    .bind(userSub,idOf(checkout.customer)||null,period,"one_time","active",expiry,checkout.id,0).run();
}

async function syncSubscription(env,subscription){
  const userSub=subscription.metadata?.user_sub||await userSubForCustomer(env,idOf(subscription.customer));
  if(!userSub)return;
  const period=periodFromSubscription(subscription,env)||(PERIODS.has(subscription.metadata?.period)?subscription.metadata.period:"monthly");
  const end=subscriptionPeriodEnd(subscription);
  await env.DB.prepare(`INSERT INTO tarot_memberships(user_sub,stripe_customer_id,stripe_subscription_id,plan_period,payment_type,status,current_period_end,cancel_at_period_end,updated_at)
    VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_sub) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,plan_period=excluded.plan_period,payment_type='subscription',status=excluded.status,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=CURRENT_TIMESTAMP`)
    .bind(userSub,idOf(subscription.customer)||null,subscription.id,period,"subscription",subscription.status||"incomplete",end,subscription.cancel_at_period_end?1:0).run();
}

async function getOrCreateCustomer(env,session){
  const existing=await env.DB.prepare("SELECT stripe_customer_id FROM stripe_customers WHERE user_sub=?").bind(session.sub).first();
  if(existing?.stripe_customer_id)return existing.stripe_customer_id;
  const params=new URLSearchParams();
  if(session.email)params.set("email",session.email);
  if(session.name||session.nickname)params.set("name",session.name||session.nickname);
  params.set("metadata[user_sub]",session.sub);
  const customer=await stripeRequest(env,"/customers",{method:"POST",body:params,idempotencyKey:`customer-${await sha256(session.sub)}`});
  await env.DB.prepare(`INSERT INTO stripe_customers(user_sub,stripe_customer_id,email,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_sub) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,email=excluded.email,updated_at=CURRENT_TIMESTAMP`).bind(session.sub,customer.id,session.email||null).run();
  return customer.id;
}

async function stripeRequest(env,path,{method="GET",body=null,idempotencyKey=""}={}){
  assertStripe(env);
  const headers={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,Accept:"application/json"};
  if(method!=="GET")headers["Content-Type"]="application/x-www-form-urlencoded";
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const response=await fetch(`${STRIPE_API}${path}`,{method,headers,...(body?{body:body.toString()}:{})});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new StripeApiError(response.status,payload?.error?.code||"STRIPE_ERROR");
  return payload;
}

function planConfiguration(env){return ["weekly","monthly","yearly"].flatMap(period=>["subscription","one_time"].map(paymentType=>({period,paymentType,priceId:membershipPriceId(env,period,paymentType)})))}
function membershipPriceId(env,period,paymentType){const key=`STRIPE_PRICE_${paymentType==="subscription"?"SUB":"ONETIME"}_${period.toUpperCase()}`;const value=env[key];return typeof value==="string"&&/^price_[A-Za-z0-9]+$/.test(value)?value:""}
function expectedMembershipPrice(period,paymentType){return MEMBERSHIP_PRICING[paymentType][period]}
function validMembershipPrice(price,period,paymentType){const expected=expectedMembershipPrice(period,paymentType),recurring=price?.recurring;return Boolean(price?.active)&&price?.currency==="thb"&&price?.unit_amount===expected.amount&&(paymentType==="subscription"?recurring?.interval===expected.interval&&Number(recurring?.interval_count||1)===1:!recurring)}
function publicMembership(value){if(!value)return null;return {period:value.plan_period||null,paymentType:value.payment_type||null,status:value.status||"inactive",active:["active","trialing"].includes(value.status)&&(!value.current_period_end||new Date(value.current_period_end)>new Date()),currentPeriodEnd:value.current_period_end||null,cancelAtPeriodEnd:Boolean(value.cancel_at_period_end),updatedAt:value.updated_at||null}}
function checkoutUrl(checkout,headers){if(typeof checkout.url!=="string"||!checkout.url.startsWith("https://checkout.stripe.com/"))throw new StripeApiError(502,"INVALID_CHECKOUT_URL");return json({success:true,url:checkout.url},200,headers)}
function validRequestId(value){return typeof value==="string"&&RETRY_SAFE_ID.test(value)?value:""}
function siteUrl(env){try{const value=new URL(env.SITE_URL||"https://sorasukt.com");if(value.protocol==="https:"&&["sorasukt.com","www.sorasukt.com"].includes(value.hostname))return value.origin}catch{}return "https://sorasukt.com"}
function assertStripe(env){if(!env.STRIPE_SECRET_KEY)throw new StripeApiError(503,"STRIPE_NOT_CONFIGURED")}
function assertDb(env){if(!env.DB)throw new Error("D1 is not configured")}
function unauthorized(headers){return json({success:false,error:{code:"UNAUTHORIZED",message:"กรุณาลงชื่อใช้งานก่อนดำเนินการ"}},401,headers)}
function methodNotAllowed(headers){return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
function idOf(value){return typeof value==="string"?value:value?.id||""}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function addPeriod(date,period){const next=new Date(date);next.setUTCDate(next.getUTCDate()+(period==="weekly"?7:period==="yearly"?365:30));return next}
function subscriptionPeriodEnd(subscription){const seconds=Number(subscription.current_period_end||Math.max(0,...(subscription.items?.data||[]).map(item=>Number(item.current_period_end)||0)));return seconds?new Date(seconds*1000).toISOString():null}
function periodFromSubscription(subscription,env){const price=subscription.items?.data?.[0]?.price||null,priceId=idOf(price);for(const period of PERIODS)if(priceId&&priceId===membershipPriceId(env,period,"subscription"))return period;const interval=price?.recurring?.interval;return interval==="week"?"weekly":interval==="month"?"monthly":interval==="year"?"yearly":""}
function subscriptionIdFromInvoice(invoice){return idOf(invoice.subscription)||idOf(invoice.parent?.subscription_details?.subscription)}
async function userSubForCustomer(env,customerId){if(!customerId)return "";const row=await env.DB.prepare("SELECT user_sub FROM stripe_customers WHERE stripe_customer_id=?").bind(customerId).first();return row?.user_sub||""}
async function expandedPaymentIntent(env,value){if(!value)return null;if(typeof value==="object")return value;const query=new URLSearchParams();query.append("expand[]","latest_charge");return stripeRequest(env,`/payment_intents/${encodeURIComponent(value)}?${query}`)}
async function expandedInvoice(env,value){if(!value)return null;if(typeof value==="object")return value;return stripeRequest(env,`/invoices/${encodeURIComponent(value)}`)}
function safeStripeDocumentUrl(value){if(typeof value!=="string")return "";try{const url=new URL(value),host=url.hostname.toLowerCase(),trusted=host==="stripe.com"||host.endsWith(".stripe.com")||host==="stripepayments.com"||host.endsWith(".stripepayments.com");return url.protocol==="https:"&&trusted?url.toString():""}catch{return ""}}
async function sha256(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
