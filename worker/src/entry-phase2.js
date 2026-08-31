import baseWorker from "./entry.js";
import {getSession} from "./auth-web.js";
import {handleAdvancedBilling,handleAdvancedAdmin,handleStripeWebhookWithRecovery} from "./stripe-advanced.js";
import {handleBillingAccount} from "./billing-account.js";

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
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
    const advancedAdmin=url.pathname==="/api/admin/payments/refund";
    if(!billingAccount.has(url.pathname)&&!advancedBilling.has(url.pathname)&&!advancedAdmin)return baseWorker.fetch(request,env,ctx);

    const origin=request.headers.get("Origin")||"";
    const corsOrigin=allowedOrigin(origin,env);
    if(request.method==="OPTIONS")return preflight(corsOrigin);
    const headers=baseHeaders(request,env);
    if(origin&&!corsOrigin)return json({success:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"Origin not allowed"}},403,headers);

    let session=null;
    try{session=await getSession(request,env)}catch(error){console.error(JSON.stringify({message:"Billing phase 2 session failed",error:error?.message||"error"}))}
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