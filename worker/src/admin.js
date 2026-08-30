import {readJsonBody,RequestBodyError} from "./request.js";

const STRIPE_API="https://api.stripe.com/v1";
const CASE_STATUSES=new Set(["open","pending","resolved","closed"]);
const CASE_PRIORITIES=new Set(["low","normal","high","urgent"]);

export async function handleAdmin(request,env,headers,session){
  if(!session)return json({success:false,error:{code:"UNAUTHORIZED",message:"Authentication required"}},401,headers);
  if(!isAdmin(session,env))return json({success:false,error:{code:"FORBIDDEN",message:"Admin access required"}},403,headers);
  if(!env.DB)return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"Storage is not configured"}},503,headers);
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/admin/session")return only(request,"GET",headers,()=>json({success:true,admin:{sub:session.sub,name:session.name,email:session.email}},200,headers));
    if(url.pathname==="/api/admin/overview")return only(request,"GET",headers,()=>overview(env,headers));
    if(url.pathname==="/api/admin/payments")return only(request,"GET",headers,()=>payments(env,headers,url));
    if(url.pathname==="/api/admin/memberships")return only(request,"GET",headers,()=>memberships(env,headers,url));
    if(url.pathname==="/api/admin/customers")return only(request,"GET",headers,()=>customers(env,headers,url));
    if(url.pathname==="/api/admin/support/cases"){
      if(request.method==="GET")return supportCases(env,headers,url);
      if(request.method==="POST")return createCase(request,env,headers,session);
      return methodNotAllowed(headers);
    }
    const match=url.pathname.match(/^\/api\/admin\/support\/cases\/(\d+)$/);
    if(match){
      if(request.method!=="PUT")return methodNotAllowed(headers);
      return updateCase(request,env,headers,session,Number(match[1]));
    }
    if(url.pathname==="/api/admin/audit")return only(request,"GET",headers,()=>auditLog(env,headers,url));
    if(url.pathname==="/api/admin/stripe/portal")return only(request,"POST",headers,()=>stripeDashboard(headers));
    return json({success:false,error:{code:"NOT_FOUND",message:"Not found"}},404,headers);
  }catch(error){
    console.error(JSON.stringify({message:"Admin route failed",path:url.pathname,error:error?.name||"error"}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:error.message}},error.status,headers);
    return json({success:false,error:{code:"ADMIN_ERROR",message:"Unable to complete admin request"}},500,headers);
  }
}

export function isAdmin(session,env){
  const subs=csv(env.ADMIN_USER_SUBS); const emails=csv(env.ADMIN_EMAILS).map(x=>x.toLowerCase());
  return Boolean((session?.sub&&subs.includes(session.sub))||(session?.email&&emails.includes(String(session.email).toLowerCase())));
}

async function overview(env,headers){
  const [accounts,memberships,payments,cases]=await Promise.all([
    firstValue(env,"SELECT COUNT(*) AS value FROM member_accounts"),
    firstValue(env,"SELECT COUNT(*) AS value FROM tarot_memberships WHERE status IN ('active','trialing')"),
    env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(amount),0) AS total FROM stripe_payments WHERE payment_status='paid'").first(),
    firstValue(env,"SELECT COUNT(*) AS value FROM support_cases WHERE status IN ('open','pending')")
  ]);
  return json({success:true,metrics:{customers:accounts,activeMemberships:memberships,paidPayments:Number(payments?.count||0),revenueMinor:Number(payments?.total||0),openCases:cases,currency:"THB"}},200,headers);
}

async function payments(env,headers,url){
  const limit=clamp(url.searchParams.get("limit"),1,100,50);
  const rows=await env.DB.prepare(`SELECT p.stripe_checkout_session_id,p.user_sub,p.kind,p.stripe_customer_id,p.stripe_payment_intent_id,p.amount,p.currency,p.payment_status,p.receipt_url,p.reward_fulfillment_status,p.created_at,p.updated_at,a.email,a.display_name FROM stripe_payments p LEFT JOIN member_accounts a ON a.user_sub=p.user_sub ORDER BY p.created_at DESC LIMIT ?`).bind(limit).all();
  return json({success:true,payments:rows.results||[]},200,headers);
}

async function memberships(env,headers,url){
  const limit=clamp(url.searchParams.get("limit"),1,100,50);
  const rows=await env.DB.prepare(`SELECT m.user_sub,m.stripe_customer_id,m.stripe_subscription_id,m.plan_period,m.payment_type,m.status,m.current_period_end,m.cancel_at_period_end,m.updated_at,a.email,a.display_name FROM tarot_memberships m LEFT JOIN member_accounts a ON a.user_sub=m.user_sub ORDER BY m.updated_at DESC LIMIT ?`).bind(limit).all();
  return json({success:true,memberships:rows.results||[]},200,headers);
}

async function customers(env,headers,url){
  const limit=clamp(url.searchParams.get("limit"),1,100,50); const q=(url.searchParams.get("q")||"").trim();
  let result;
  if(q){const like=`%${q.replace(/[%_]/g,"")} %`.trim();result=await env.DB.prepare(`SELECT a.user_sub,a.display_name,a.email,a.last_seen_at,a.created_at,m.plan_period,m.payment_type,m.status AS membership_status FROM member_accounts a LEFT JOIN tarot_memberships m ON m.user_sub=a.user_sub WHERE a.email LIKE ? OR a.display_name LIKE ? OR a.user_sub LIKE ? ORDER BY a.last_seen_at DESC LIMIT ?`).bind(like,like,like,limit).all();}
  else result=await env.DB.prepare(`SELECT a.user_sub,a.display_name,a.email,a.last_seen_at,a.created_at,m.plan_period,m.payment_type,m.status AS membership_status FROM member_accounts a LEFT JOIN tarot_memberships m ON m.user_sub=a.user_sub ORDER BY a.last_seen_at DESC LIMIT ?`).bind(limit).all();
  return json({success:true,customers:result.results||[]},200,headers);
}

async function supportCases(env,headers,url){
  const limit=clamp(url.searchParams.get("limit"),1,100,50);
  const rows=await env.DB.prepare(`SELECT c.id,c.user_sub,c.customer_email,c.subject,c.description,c.status,c.priority,c.assigned_to,c.created_at,c.updated_at,a.display_name FROM support_cases c LEFT JOIN member_accounts a ON a.user_sub=c.user_sub ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,c.updated_at DESC LIMIT ?`).bind(limit).all();
  return json({success:true,cases:rows.results||[]},200,headers);
}

async function createCase(request,env,headers,session){
  const body=await readJsonBody(request,8_192); const subject=text(body?.subject,160); const description=text(body?.description,4000); const email=text(body?.customerEmail,320); const userSub=text(body?.userSub,255); const priority=CASE_PRIORITIES.has(body?.priority)?body.priority:"normal";
  if(!subject)return json({success:false,error:{code:"INVALID_CASE",message:"Subject is required"}},400,headers);
  const result=await env.DB.prepare("INSERT INTO support_cases(user_sub,customer_email,subject,description,status,priority,assigned_to) VALUES(?,?,?,?, 'open',?,?)").bind(userSub||null,email||null,subject,description||null,priority,session.email||session.sub).run();
  await audit(env,session,"support.case.create",String(result.meta?.last_row_id||""),{subject,priority});
  return json({success:true,id:result.meta?.last_row_id||null},201,headers);
}

async function updateCase(request,env,headers,session,id){
  const body=await readJsonBody(request,8_192); const current=await env.DB.prepare("SELECT * FROM support_cases WHERE id=?").bind(id).first();
  if(!current)return json({success:false,error:{code:"CASE_NOT_FOUND",message:"Support case not found"}},404,headers);
  const status=CASE_STATUSES.has(body?.status)?body.status:current.status; const priority=CASE_PRIORITIES.has(body?.priority)?body.priority:current.priority; const assigned=text(body?.assignedTo,320)||current.assigned_to; const note=text(body?.note,4000);
  await env.DB.prepare("UPDATE support_cases SET status=?,priority=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,priority,assigned,id).run();
  if(note)await env.DB.prepare("INSERT INTO support_case_notes(case_id,author_sub,author_email,note) VALUES(?,?,?,?)").bind(id,session.sub,session.email||null,note).run();
  await audit(env,session,"support.case.update",String(id),{status,priority,assignedTo:assigned,noteAdded:Boolean(note)});
  return json({success:true},200,headers);
}

async function auditLog(env,headers,url){const limit=clamp(url.searchParams.get("limit"),1,100,50);const rows=await env.DB.prepare("SELECT id,actor_sub,actor_email,action,target,metadata,created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT ?").bind(limit).all();return json({success:true,events:rows.results||[]},200,headers)}
async function audit(env,session,action,target,metadata){await env.DB.prepare("INSERT INTO admin_audit_log(actor_sub,actor_email,action,target,metadata) VALUES(?,?,?,?,?)").bind(session.sub,session.email||null,action,target||null,JSON.stringify(metadata||{})).run()}
async function firstValue(env,sql){const row=await env.DB.prepare(sql).first();return Number(row?.value||0)}
function stripeDashboard(headers){return json({success:true,url:"https://dashboard.stripe.com/"},200,headers)}
function only(request,method,headers,fn){return request.method===method?fn():methodNotAllowed(headers)}
function methodNotAllowed(headers){return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
function csv(value){return String(value||"").split(",").map(x=>x.trim()).filter(Boolean)}
function clamp(value,min,max,fallback){const n=Number(value);return Number.isInteger(n)?Math.min(max,Math.max(min,n)):fallback}
function text(value,max){return typeof value==="string"?value.trim().slice(0,max):""}
