import baseWorker from "./entry.js";
import {getSession} from "./auth-web.js";
import {handleAdvancedBilling,handleAdvancedAdmin,handleStripeWebhookWithRecovery} from "./stripe-advanced.js";
import {handleBillingAccount} from "./billing-account.js";
import {handleRedeem} from "./redeem.js";
import {handleRedeemAdmin} from "./redeem-admin.js";
import {publicStatus} from "./system-status.js";

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.hostname==="admin.sorasukt.com"){
      if(!env.ADMIN_ASSETS)return new Response("Admin Center is unavailable.",{status:503,headers:{"Cache-Control":"no-store"}});
      const response=await env.ADMIN_ASSETS.fetch(request);
      const headers=new Headers(response.headers);
      headers.set("X-Content-Type-Options","nosniff");
      headers.set("Referrer-Policy","same-origin");
      headers.set("X-Frame-Options","DENY");
      if(url.pathname==="/"||url.pathname.endsWith(".html"))headers.set("Cache-Control","no-store");
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    if(url.pathname==="/api/status"&&request.method==="GET")return publicStatus(env,baseHeaders(request,env));
    if(url.pathname==="/pangtang"||url.pathname.startsWith("/pangtang/")){
      if(!env.PANGTANG_API)return json({success:false,error:{code:"SERVICE_UNAVAILABLE",message:"PangTang API is not configured"}},503,baseHeaders(request,env));
      const target=new URL(request.url);
      target.pathname=url.pathname.slice("/pangtang".length)||"/";
      const forwardedHeaders=new Headers(request.headers);
      forwardedHeaders.delete("X-PangTang-Identity");
      if(request.method!=="OPTIONS"&&target.pathname!=="/health"){
        let session=null;
        try{session=await getSession(request,env)}catch(error){console.error(JSON.stringify({message:"PangTang session failed",error:error?.message||"error"}))}
        if(session)forwardedHeaders.set("X-PangTang-Identity",encodeIdentity({sub:session.sub,email:session.email,name:session.name,test_membership:Boolean(session.test_access?.membership),test_expires_at:session.test_access?.exp||null}));
      }
      return env.PANGTANG_API.fetch(new Request(target,{method:request.method,headers:forwardedHeaders,body:request.method==="GET"||request.method==="HEAD"?undefined:request.body,redirect:"manual"}));
    }
    if(url.pathname==="/api/stripe/webhook")return handleStripeWebhookWithRecovery(request,env);

    const billingAccount=new Set([
      "/api/billing/account",
      "/api/billing/account/portal"
    ]);
    const advancedBilling=new Set([
      "/api/billing/invoices",
      "/api/billing/recovery",
      "/api/billing/subscription/change",
      "/api/billing/subscription/cancel"
    ]);
    const redeemRoute=url.pathname==="/api/redeem";
    const redeemAdmin=url.pathname==="/api/admin/redeem-codes";
    const advancedAdmin=url.pathname==="/api/admin/payments/refund";
    if(!billingAccount.has(url.pathname)&&!advancedBilling.has(url.pathname)&&!advancedAdmin&&!redeemRoute&&!redeemAdmin)return baseWorker.fetch(request,env,ctx);

    const origin=request.headers.get("Origin")||"";
    const corsOrigin=allowedOrigin(origin,env);
    if(request.method==="OPTIONS")return preflight(corsOrigin);
    const headers=baseHeaders(request,env);
    if(origin&&!corsOrigin)return json({success:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"Origin not allowed"}},403,headers);

    let session=null;
    try{session=await getSession(request,env)}catch(error){console.error(JSON.stringify({message:"Billing phase 2 session failed",error:error?.message||"error"}))}
    if(redeemRoute){const response=await handleRedeem(request,env,headers,session);return response||baseWorker.fetch(request,env,ctx)}
    if(redeemAdmin){const response=await handleRedeemAdmin(request,env,headers,session);return response||baseWorker.fetch(request,env,ctx)}
    if(advancedAdmin){const response=await handleAdvancedAdmin(request,env,headers,session);return response||baseWorker.fetch(request,env,ctx)}
    if(billingAccount.has(url.pathname)){const response=await handleBillingAccount(request,env,headers,session);return response||baseWorker.fetch(request,env,ctx)}
    const response=await handleAdvancedBilling(request,env,headers,session);
    return response||baseWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof baseWorker.scheduled==="function")return baseWorker.scheduled(controller,env,ctx);
  }
};

function allowedOrigin(origin,env){const allowed=(env.ALLOWED_ORIGINS||"https://sorasukt.com,https://www.sorasukt.com").split(",").map(x=>x.trim()).filter(Boolean);return allowed.includes(origin)?origin:""}
function baseHeaders(request,env){const origin=request.headers.get("Origin")||"",corsOrigin=allowedOrigin(origin,env),headers=new Headers();headers.set("Content-Type","application/json; charset=utf-8");headers.set("Cache-Control","no-store");headers.set("Vary","Origin");if(corsOrigin){headers.set("Access-Control-Allow-Origin",corsOrigin);headers.set("Access-Control-Allow-Credentials","true")}return headers}
function preflight(corsOrigin){if(!corsOrigin)return new Response(null,{status:403,headers:{"Cache-Control":"no-store","Vary":"Origin"}});const headers=new Headers();headers.set("Access-Control-Allow-Origin",corsOrigin);headers.set("Access-Control-Allow-Credentials","true");headers.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");headers.set("Access-Control-Allow-Headers","Content-Type, X-Tarot-Policy-Version");headers.set("Access-Control-Max-Age","86400");headers.set("Cache-Control","no-store");headers.set("Vary","Origin, Access-Control-Request-Method, Access-Control-Request-Headers");return new Response(null,{status:204,headers})}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}

function encodeIdentity(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
