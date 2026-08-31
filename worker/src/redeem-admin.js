import {readJsonBody,RequestBodyError} from "./request.js";
import {adminAccess} from "./admin.js";

const PERIODS=new Set(["weekly","monthly","yearly"]);

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
      const rows=await env.DB.prepare("SELECT code,plan_period,status,expires_at,used_by,used_at,note,created_at,updated_at FROM redeem_codes ORDER BY created_at DESC LIMIT ?").bind(limit).all();
      return json({success:true,codes:(rows.results||[]).map(publicCode)},200,headers);
    }
    if(request.method==="POST"){
      const body=await readJsonBody(request,4_096);
      const plan=normalizePlan(body?.plan);
      if(!plan)return json({success:false,error:{code:"INVALID_PLAN",message:"Plan must be weekly, monthly, or yearly"}},400,headers);
      const code=normalizeCode(body?.code)||generateCode(plan);
      const expiresAt=normalizeDate(body?.expiresAt);
      const note=typeof body?.note==="string"?body.note.trim().slice(0,500):null;
      try{
        await env.DB.prepare("INSERT INTO redeem_codes(code,plan_period,status,expires_at,note) VALUES(?,?,'active',?,?)").bind(code,plan,expiresAt,note||null).run();
      }catch(error){
        if(String(error?.message||"").toLowerCase().includes("unique"))return json({success:false,error:{code:"CODE_EXISTS",message:"Redeem code already exists"}},409,headers);
        throw error;
      }
      return json({success:true,redeem:{code,plan,expiresAt,redeemUrl:`${siteUrl(env)}/redeem/?code=${encodeURIComponent(code)}&plan=${encodeURIComponent(plan)}`}},201,headers);
    }
    return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  }catch(error){
    console.error(JSON.stringify({message:"Redeem admin route failed",error:error?.name||"error"}));
    if(error instanceof RequestBodyError)return json({success:false,error:{code:error.code,message:"Invalid request body"}},error.status,headers);
    return json({success:false,error:{code:"REDEEM_ADMIN_ERROR",message:"Unable to manage redeem codes"}},500,headers);
  }
}

function publicCode(row){return {...row,redeemUrl:`/redeem/?code=${encodeURIComponent(row.code)}&plan=${encodeURIComponent(row.plan_period)}`}}
function normalizePlan(value){const raw=String(value||"").trim().toLowerCase();const aliases={week:"weekly",weekly:"weekly",month:"monthly",monthly:"monthly",year:"yearly",annual:"yearly",yearly:"yearly"};const plan=aliases[raw]||"";return PERIODS.has(plan)?plan:""}
function normalizeCode(value){const code=String(value||"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9_-]{5,63}$/.test(code)?code:""}
function normalizeDate(value){if(value==null||value==="")return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString()}
function generateCode(plan){const prefix=plan==="weekly"?"WEEK":plan==="monthly"?"MONTH":"YEAR";const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);const token=[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();return `${prefix}-${token}`}
function siteUrl(env){return (env.SITE_URL||"https://sorasukt.com").replace(/\/$/,"")}
function clamp(value,min,max,fallback){const n=Number(value);return Number.isInteger(n)?Math.min(max,Math.max(min,n)):fallback}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
