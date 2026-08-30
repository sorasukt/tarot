import {readJsonBody,RequestBodyError} from "./request.js";
import {handleStripeWebhook} from "./stripe.js";
import {adminAccess} from "./admin.js";

const STRIPE_API="https://api.stripe.com/v1";
const PERIODS=new Set(["weekly","monthly","yearly"]);

export async function handleAdvancedBilling(request,env,headers,session){
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/billing/invoices"){
      if(request.method!=="GET")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return invoiceHistory(env,headers,session.sub);
    }
    if(url.pathname==="/api/billing/recovery"){
      if(request.method!=="GET")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return recoveryStatus(env,headers,session.sub);
    }
    if(url.pathname==="/api/billing/subscription/change"){
      if(request.method!=="POST")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return changeSubscription(request,env,headers,session.sub);
    }
    if(url.pathname==="/api/billing/subscription/cancel"){
      if(request.method!=="POST")return methodNotAllowed(headers);
      if(!session)return unauthorized(headers);
      return cancellationPortal(env,headers,session.sub);
    }
    return null;
  }catch(error){
    console.error(JSON.stringify({message:"Stripe advanced billing failed",path:url.pathname,error:error?.name||"error",status:error?.status||null}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);
    if(error instanceof StripeAdvancedError)return json({success:false,error:{code:error.code,message:error.publicMessage}},error.status,headers);
    return json({success:false,error:{code:"BILLING_ADVANCED_ERROR",message:"ไม่สามารถดำเนินการข้อมูลการชำระเงินได้ในขณะนี้"}},500,headers);
  }
}

export async function handleAdvancedAdmin(request,env,headers,session){
  const url=new URL(request.url);
  if(url.pathname!=="/api/admin/payments/refund")return null;
  if(request.method!=="POST")return methodNotAllowed(headers);
  if(!session)return unauthorized(headers);
  const access=adminAccess(session);
  if(!access.roles.some(role=>role==="admin"||role==="billing"))return json({success:false,error:{code:"FORBIDDEN",message:"Billing role required"}},403,headers);
  if(!env.DB)return storageRequired(headers);
  try{
    const body=await readJsonBody(request,4_096);
    const paymentIntentId=cleanId(body?.paymentIntentId,"pi_");
    const requestedAmount=body?.amount==null?null:Number(body.amount);
    if(!paymentIntentId||requestedAmount!==null&&(!Number.isInteger(requestedAmount)||requestedAmount<=0))return json({success:false,error:{code:"INVALID_REFUND",message:"ข้อมูลการคืนเงินไม่ถูกต้อง"}},400,headers);
    const payment=await env.DB.prepare("SELECT stripe_checkout_session_id,user_sub,amount,currency,payment_status,stripe_payment_intent_id FROM stripe_payments WHERE stripe_payment_intent_id=?").bind(paymentIntentId).first();
    if(!payment)return json({success:false,error:{code:"PAYMENT_NOT_FOUND",message:"ไม่พบรายการชำระเงินนี้"}},404,headers);
    const totals=await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS refunded FROM stripe_refunds WHERE stripe_payment_intent_id=? AND status IN ('pending','succeeded')").bind(paymentIntentId).first();
    const remaining=Math.max(0,Number(payment.amount||0)-Number(totals?.refunded||0));
    const amount=requestedAmount===null?remaining:requestedAmount;
    if(amount<=0||amount>remaining)return json({success:false,error:{code:"REFUND_AMOUNT_INVALID",message:"ยอดคืนเงินสูงกว่ายอดที่สามารถคืนได้"}},409,headers);
    const params=new URLSearchParams({payment_intent:paymentIntentId,amount:String(amount),reason:"requested_by_customer"});
    params.set("metadata[admin_sub]",session.sub);
    params.set("metadata[source]","tarot_admin");
    const refund=await stripe(env,"/refunds",{method:"POST",body:params,idempotencyKey:`refund-${paymentIntentId}-${amount}-${Date.now()}`});
    await env.DB.prepare("INSERT OR REPLACE INTO stripe_refunds(stripe_refund_id,stripe_payment_intent_id,stripe_checkout_session_id,user_sub,amount,currency,status,reason,admin_sub,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(refund.id,paymentIntentId,payment.stripe_checkout_session_id||null,payment.user_sub||null,Number(refund.amount||amount),String(refund.currency||payment.currency||"thb"),refund.status||"pending",refund.reason||"requested_by_customer",session.sub).run();
    const afterRemaining=Math.max(0,remaining-Number(refund.amount||amount));
    await env.DB.prepare("UPDATE stripe_payments SET payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE stripe_payment_intent_id=?").bind(afterRemaining===0?"refunded":"partially_refunded",paymentIntentId).run();
    return json({success:true,refund:{id:refund.id,amount:Number(refund.amount||amount),currency:refund.currency||payment.currency,status:refund.status||"pending",remaining:afterRemaining}},200,headers);
  }catch(error){
    console.error(JSON.stringify({message:"Stripe refund failed",error:error?.name||"error",status:error?.status||null}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"ข้อมูลคำขอไม่ถูกต้อง"}},error.status,headers);
    if(error instanceof StripeAdvancedError)return json({success:false,error:{code:error.code,message:error.publicMessage}},error.status,headers);
    return json({success:false,error:{code:"REFUND_ERROR",message:"คืนเงินไม่สำเร็จ กรุณาลองใหม่"}},500,headers);
  }
}

export async function handleStripeWebhookWithRecovery(request,env){
  const copy=request.clone();
  const response=await handleStripeWebhook(copy,env);
  if(!response.ok||!env.DB)return response;
  try{
    const event=await request.json();
    await syncRecoveryEvent(event,env);
  }catch(error){console.error(JSON.stringify({message:"Stripe recovery sync skipped",error:error?.message||"error"}))}
  return response;
}

async function invoiceHistory(env,headers,userSub){
  assertStripe(env);assertDb(env);
  const customer=await env.DB.prepare("SELECT stripe_customer_id FROM stripe_customers WHERE user_sub=?").bind(userSub).first();
  if(!customer?.stripe_customer_id)return json({success:true,invoices:[]},200,headers);
  const list=await stripe(env,`/invoices?customer=${encodeURIComponent(customer.stripe_customer_id)}&limit=24`);
  const invoices=(Array.isArray(list.data)?list.data:[]).map(item=>({
    id:item.id,status:item.status||"draft",currency:item.currency||"thb",amountDue:Number(item.amount_due||0),amountPaid:Number(item.amount_paid||0),amountRemaining:Number(item.amount_remaining||0),created:unixIso(item.created),periodStart:unixIso(item.period_start),periodEnd:unixIso(item.period_end),number:item.number||null,description:item.description||null,hostedInvoiceUrl:httpsUrl(item.hosted_invoice_url),invoicePdf:httpsUrl(item.invoice_pdf),paymentIntent:typeof item.payment_intent==="string"?item.payment_intent:null
  }));
  return json({success:true,invoices},200,headers);
}

async function recoveryStatus(env,headers,userSub){
  assertDb(env);
  const row=await env.DB.prepare("SELECT state,stripe_invoice_id,attempt_count,next_payment_attempt,hosted_invoice_url,last_failed_at,recovered_at,updated_at FROM stripe_billing_recovery WHERE user_sub=?").bind(userSub).first();
  if(!row)return json({success:true,recovery:null},200,headers);
  return json({success:true,recovery:{state:row.state,invoiceId:row.stripe_invoice_id||null,attemptCount:Number(row.attempt_count||0),nextPaymentAttempt:row.next_payment_attempt||null,hostedInvoiceUrl:httpsUrl(row.hosted_invoice_url),lastFailedAt:row.last_failed_at||null,recoveredAt:row.recovered_at||null,updatedAt:row.updated_at||null}},200,headers);
}

async function changeSubscription(request,env,headers,userSub){
  assertStripe(env);assertDb(env);
  const body=await readJsonBody(request,4_096);
  const period=PERIODS.has(body?.period)?body.period:"";
  if(!period)return json({success:false,error:{code:"INVALID_PLAN",message:"กรุณาเลือกแพ็กเกจที่ถูกต้อง"}},400,headers);
  const priceId=membershipPriceId(env,period);
  if(!priceId)return json({success:false,error:{code:"PLAN_NOT_CONFIGURED",message:"แพ็กเกจนี้ยังไม่พร้อมใช้งาน"}},503,headers);
  const row=await env.DB.prepare("SELECT stripe_subscription_id,status,plan_period FROM tarot_memberships WHERE user_sub=? AND payment_type='subscription'").bind(userSub).first();
  if(!row?.stripe_subscription_id||["canceled","incomplete_expired"].includes(row.status))return json({success:false,error:{code:"SUBSCRIPTION_NOT_FOUND",message:"ไม่พบ Subscription ที่สามารถเปลี่ยนแพ็กเกจได้"}},404,headers);
  if(row.plan_period===period)return json({success:true,unchanged:true,period},200,headers);
  const subscription=await stripe(env,`/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}?expand[]=items.data.price`);
  const item=subscription?.items?.data?.[0];
  if(!item?.id)throw new StripeAdvancedError(502,"SUBSCRIPTION_ITEM_MISSING","ไม่สามารถอ่านข้อมูล Subscription ได้");
  const params=new URLSearchParams();
  params.set("items[0][id]",item.id);
  params.set("items[0][price]",priceId);
  params.set("proration_behavior",body?.prorationBehavior==="none"?"none":"create_prorations");
  params.set("payment_behavior","pending_if_incomplete");
  params.set("metadata[period]",period);
  const updated=await stripe(env,`/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`,{method:"POST",body:params,idempotencyKey:`change-${row.stripe_subscription_id}-${period}`});
  await env.DB.prepare("UPDATE tarot_memberships SET plan_period=?,status=?,current_period_end=?,cancel_at_period_end=?,updated_at=CURRENT_TIMESTAMP WHERE user_sub=?").bind(period,updated.status||row.status,unixIso(updated.current_period_end),updated.cancel_at_period_end?1:0,userSub).run();
  return json({success:true,membership:{period,status:updated.status||row.status,currentPeriodEnd:unixIso(updated.current_period_end),cancelAtPeriodEnd:Boolean(updated.cancel_at_period_end)}},200,headers);
}

async function cancellationPortal(env,headers,userSub){
  assertStripe(env);assertDb(env);
  const row=await env.DB.prepare("SELECT stripe_customer_id,stripe_subscription_id,status FROM tarot_memberships WHERE user_sub=? AND payment_type='subscription'").bind(userSub).first();
  if(!row?.stripe_customer_id||!row?.stripe_subscription_id||["canceled","incomplete_expired"].includes(row.status))return json({success:false,error:{code:"SUBSCRIPTION_NOT_FOUND",message:"ไม่พบ Subscription ที่สามารถจัดการได้"}},404,headers);
  const params=new URLSearchParams({customer:row.stripe_customer_id,return_url:`${siteUrl(env)}/tarot/me/?billing=updated`});
  params.set("flow_data[type]","subscription_cancel");
  params.set("flow_data[subscription_cancel][subscription]",row.stripe_subscription_id);
  params.set("flow_data[after_completion][type]","redirect");
  params.set("flow_data[after_completion][redirect][return_url]",`${siteUrl(env)}/tarot/me/?billing=updated`);
  const portal=await stripe(env,"/billing_portal/sessions",{method:"POST",body:params});
  if(!httpsUrl(portal.url)||!portal.url.startsWith("https://billing.stripe.com/"))throw new StripeAdvancedError(502,"INVALID_PORTAL_URL","เปิดหน้าจัดการการยกเลิกไม่สำเร็จ");
  return json({success:true,url:portal.url,retention:"portal"},200,headers);
}

async function syncRecoveryEvent(event,env){
  const type=event?.type||"";const object=event?.data?.object||{};
  if(!["invoice.payment_failed","invoice.paid","invoice.payment_succeeded"].includes(type))return;
  const subscriptionId=typeof object.subscription==="string"?object.subscription:null;
  const customerId=typeof object.customer==="string"?object.customer:null;
  let member=null;
  if(subscriptionId)member=await env.DB.prepare("SELECT user_sub FROM tarot_memberships WHERE stripe_subscription_id=?").bind(subscriptionId).first();
  if(!member&&customerId)member=await env.DB.prepare("SELECT user_sub FROM tarot_memberships WHERE stripe_customer_id=?").bind(customerId).first();
  if(!member?.user_sub)return;
  const next=unixIso(object.next_payment_attempt);
  if(type==="invoice.payment_failed"){
    await env.DB.prepare("INSERT INTO stripe_billing_recovery(user_sub,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,state,attempt_count,next_payment_attempt,hosted_invoice_url,last_failed_at,recovered_at,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP) ON CONFLICT(user_sub) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,stripe_invoice_id=excluded.stripe_invoice_id,state='payment_failed',attempt_count=excluded.attempt_count,next_payment_attempt=excluded.next_payment_attempt,hosted_invoice_url=excluded.hosted_invoice_url,last_failed_at=CURRENT_TIMESTAMP,recovered_at=NULL,updated_at=CURRENT_TIMESTAMP").bind(member.user_sub,customerId,subscriptionId,object.id||null,"payment_failed",Number(object.attempt_count||0),next,httpsUrl(object.hosted_invoice_url)).run();
    return;
  }
  await env.DB.prepare("INSERT INTO stripe_billing_recovery(user_sub,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,state,attempt_count,next_payment_attempt,hosted_invoice_url,last_failed_at,recovered_at,updated_at) VALUES(?,?,?,?,?,?,?,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_sub) DO UPDATE SET stripe_invoice_id=excluded.stripe_invoice_id,state='recovered',attempt_count=excluded.attempt_count,next_payment_attempt=NULL,hosted_invoice_url=excluded.hosted_invoice_url,recovered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP").bind(member.user_sub,customerId,subscriptionId,object.id||null,"recovered",Number(object.attempt_count||0),null,httpsUrl(object.hosted_invoice_url)).run();
}

function membershipPriceId(env,period){return ({weekly:env.STRIPE_PRICE_SUB_WEEKLY,monthly:env.STRIPE_PRICE_SUB_MONTHLY,yearly:env.STRIPE_PRICE_SUB_YEARLY})[period]||""}
function siteUrl(env){return (env.SITE_URL||"https://sorasukt.com").replace(/\/$/,"")}
function assertStripe(env){if(!env.STRIPE_SECRET_KEY)throw new StripeAdvancedError(503,"STRIPE_NOT_CONFIGURED","ระบบชำระเงินยังไม่พร้อมใช้งาน")}
function assertDb(env){if(!env.DB)throw new StripeAdvancedError(503,"STORAGE_NOT_CONFIGURED","ระบบจัดเก็บข้อมูลยังไม่พร้อมใช้งาน")}
function storageRequired(headers){return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"Storage is not configured"}},503,headers)}
async function stripe(env,path,{method="GET",body=null,idempotencyKey=""}={}){
  assertStripe(env);
  const requestHeaders={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,Accept:"application/json"};
  if(body)requestHeaders["Content-Type"]="application/x-www-form-urlencoded";
  if(idempotencyKey)requestHeaders["Idempotency-Key"]=idempotencyKey;
  const response=await fetch(`${STRIPE_API}${path}`,{method,headers:requestHeaders,body:body||undefined});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok){console.error(JSON.stringify({message:"Stripe advanced API request failed",path,status:response.status,type:data?.error?.type||null,code:data?.error?.code||null}));throw new StripeAdvancedError(response.status>=500?502:response.status,"STRIPE_API_ERROR",response.status===402?"การชำระเงินต้องได้รับการยืนยันก่อนดำเนินการต่อ":"Stripe ไม่สามารถดำเนินการคำขอนี้ได้")}
  return data;
}
function cleanId(value,prefix){const text=typeof value==="string"?value.trim():"";return text.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(text)?text:""}
function unixIso(value){const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null}
function httpsUrl(value){try{const url=new URL(value);return url.protocol==="https:"?url.href:null}catch{return null}}
function unauthorized(headers){return json({success:false,error:{code:"UNAUTHORIZED",message:"Authentication required"}},401,headers)}
function methodNotAllowed(headers){return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
class StripeAdvancedError extends Error{constructor(status,code,publicMessage){super(code);this.name="StripeAdvancedError";this.status=status;this.code=code;this.publicMessage=publicMessage}}
