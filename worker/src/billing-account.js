const STRIPE_API = "https://api.stripe.com/v1";

export async function handleBillingAccount(request, env, headers, session) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/billing/account" && url.pathname !== "/api/billing/account/portal") return null;
  if (!session) return json({success:false,error:{code:"UNAUTHORIZED",message:"กรุณาลงชื่อใช้งาน"}},401,headers);
  if (!env.DB) return json({success:false,error:{code:"STORAGE_NOT_CONFIGURED",message:"ระบบจัดเก็บข้อมูลยังไม่พร้อมใช้งาน"}},503,headers);

  try {
    const customerId = await resolveCustomerId(env, session.sub);

    if (url.pathname === "/api/billing/account/portal") {
      if (request.method !== "POST") return methodNotAllowed(headers);
      if (!env.STRIPE_SECRET_KEY) return json({success:false,error:{code:"STRIPE_NOT_CONFIGURED",message:"ระบบชำระเงินยังไม่พร้อมใช้งาน"}},503,headers);
      if (!customerId) return json({success:false,error:{code:"CUSTOMER_NOT_FOUND",message:"ยังไม่พบข้อมูลการชำระเงินของบัญชีนี้"}},404,headers);
      const params = new URLSearchParams({customer:customerId,return_url:`${siteUrl(env)}/tarot/me/?billing=updated`});
      const portal = await stripe(env, "/billing_portal/sessions", {method:"POST",body:params});
      if (!safeUrl(portal?.url) || !portal.url.startsWith("https://billing.stripe.com/")) throw new Error("INVALID_PORTAL_URL");
      return json({success:true,url:portal.url},200,headers);
    }

    if (request.method !== "GET") return methodNotAllowed(headers);

    const local = await env.DB.prepare(`SELECT stripe_checkout_session_id,stripe_payment_intent_id,kind,stripe_customer_id,amount,currency,payment_status,receipt_url,created_at,updated_at
      FROM stripe_payments WHERE user_sub=? ORDER BY datetime(created_at) DESC LIMIT 40`).bind(session.sub).all();
    const payments = (local?.results || []).map(row => ({
      id: row.stripe_payment_intent_id || row.stripe_checkout_session_id,
      checkoutSessionId: row.stripe_checkout_session_id || null,
      kind: row.kind || "payment",
      status: row.payment_status || "unknown",
      amount: Number(row.amount || 0),
      currency: row.currency || "thb",
      created: row.created_at || row.updated_at || null,
      receiptUrl: safeStripeDocumentUrl(row.receipt_url),
      source: "payment"
    }));

    let invoices = [];
    let providerWarning = null;
    if (customerId && env.STRIPE_SECRET_KEY) {
      try {
        const list = await stripe(env, `/invoices?customer=${encodeURIComponent(customerId)}&limit=40`);
        invoices = (Array.isArray(list?.data) ? list.data : []).map(item => ({
          id: item.id,
          number: item.number || null,
          status: item.status || "draft",
          amount: Number(item.amount_paid || item.amount_due || 0),
          currency: item.currency || "thb",
          created: unixIso(item.created),
          hostedInvoiceUrl: safeStripeDocumentUrl(item.hosted_invoice_url),
          invoicePdf: safeStripeDocumentUrl(item.invoice_pdf),
          source: "invoice"
        }));
      } catch (error) {
        console.error(JSON.stringify({message:"Billing account invoice sync failed",error:error?.message||"error",userSub:session.sub}));
        providerWarning = "โหลดใบแจ้งหนี้จากผู้ให้บริการไม่สำเร็จ แต่ยังแสดงรายการชำระเงินที่บันทึกไว้ได้";
      }
    }

    return json({
      success:true,
      portalAvailable:Boolean(customerId && env.STRIPE_SECRET_KEY),
      customerLinked:Boolean(customerId),
      payments,
      invoices,
      warning:providerWarning
    },200,headers);
  } catch (error) {
    console.error(JSON.stringify({message:"Billing account failed",path:url.pathname,error:error?.message||"error"}));
    return json({success:false,error:{code:"BILLING_ACCOUNT_ERROR",message:"โหลดข้อมูลการชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}},500,headers);
  }
}

async function resolveCustomerId(env, userSub) {
  const direct = await env.DB.prepare("SELECT stripe_customer_id FROM stripe_customers WHERE user_sub=?").bind(userSub).first();
  if (direct?.stripe_customer_id) return direct.stripe_customer_id;
  const member = await env.DB.prepare("SELECT stripe_customer_id FROM tarot_memberships WHERE user_sub=? AND stripe_customer_id IS NOT NULL ORDER BY datetime(updated_at) DESC LIMIT 1").bind(userSub).first();
  if (member?.stripe_customer_id) return member.stripe_customer_id;
  const payment = await env.DB.prepare("SELECT stripe_customer_id FROM stripe_payments WHERE user_sub=? AND stripe_customer_id IS NOT NULL ORDER BY datetime(created_at) DESC LIMIT 1").bind(userSub).first();
  return payment?.stripe_customer_id || null;
}

async function stripe(env, path, {method="GET", body=null}={}) {
  const requestHeaders = {Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,Accept:"application/json"};
  if (body) requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
  const response = await fetch(`${STRIPE_API}${path}`, {method,headers:requestHeaders,body:body || undefined});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`STRIPE_${response.status}`);
  return data;
}

function unixIso(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}
function safeUrl(value) { try { const u = new URL(String(value || "")); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } }
function safeStripeDocumentUrl(value) { const url = safeUrl(value); if (!url) return null; try { const host = new URL(url).hostname.toLowerCase(); return host === "stripe.com" || host.endsWith(".stripe.com") || host === "stripe.network" || host.endsWith(".stripe.network") ? url : null; } catch { return null; } }
function siteUrl(env) { return (env.SITE_URL || "https://sorasukt.com").replace(/\/$/, ""); }
function methodNotAllowed(headers) { const h = new Headers(headers); h.set("Allow", "GET, POST"); return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,h); }
function json(data,status,headers) { return new Response(JSON.stringify(data),{status,headers}); }
