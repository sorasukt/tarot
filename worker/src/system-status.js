import {readJsonBody} from "./request.js";

const SERVICE_STATES=new Set(["operational","degraded","partial_outage","major_outage","maintenance"]);
const INCIDENT_STATES=new Set(["investigating","identified","monitoring","resolved","maintenance"]);
const IMPACTS=new Set(["none","minor","major","critical"]);
const TEST_SERVICES=new Set(["tarot","pangtang"]);

export async function publicStatus(env,headers){
  if(!env.DB)return json({success:false,error:{code:"STATUS_UNAVAILABLE",message:"Status storage is unavailable"}},503,headers);
  const [services,incidents,events]=await Promise.all([
    env.DB.prepare("SELECT slug,name,description,status,updated_at FROM service_status ORDER BY name").all(),
    env.DB.prepare("SELECT id,title,impact,status,message,affected_services,starts_at,resolved_at,updated_at FROM status_incidents ORDER BY starts_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT id,event_type,service_slug,incident_id,status,message,created_at FROM status_event_log ORDER BY created_at DESC LIMIT 100").all()
  ]);
  const rows=services.results||[];
  const overall=rows.some(row=>row.status==="major_outage")?"major_outage":rows.some(row=>row.status==="partial_outage")?"partial_outage":rows.some(row=>row.status==="degraded")?"degraded":rows.some(row=>row.status==="maintenance")?"maintenance":"operational";
  return json({success:true,overall,services:rows,incidents:(incidents.results||[]).map(presentIncident),events:events.results||[],updatedAt:new Date().toISOString()},200,headers);
}

export async function handleSystemAdmin(request,env,headers,session){
  const url=new URL(request.url);
  if(url.pathname==="/api/admin/services"){
    if(request.method==="GET"){
      const rows=await env.DB.prepare("SELECT slug,name,description,status,updated_at,updated_by FROM service_status ORDER BY name").all();
      return json({success:true,services:rows.results||[]},200,headers);
    }
    return methodNotAllowed(headers);
  }
  const serviceMatch=url.pathname.match(/^\/api\/admin\/services\/([a-z0-9-]+)$/);
  if(serviceMatch){
    if(request.method!=="PUT")return methodNotAllowed(headers);
    const body=await readJsonBody(request,8_192);
    const status=String(body?.status||"");
    if(!SERVICE_STATES.has(status))return invalid(headers,"Invalid service status");
    const current=await env.DB.prepare("SELECT slug,name FROM service_status WHERE slug=?").bind(serviceMatch[1]).first();
    if(!current)return json({success:false,error:{code:"SERVICE_NOT_FOUND",message:"Service not found"}},404,headers);
    const message=text(body?.message,500)||`${current.name} changed to ${status}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE service_status SET status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE slug=?").bind(status,session.email||session.sub,current.slug),
      env.DB.prepare("INSERT INTO status_event_log(event_type,service_slug,status,message,actor_email) VALUES('service.update',?,?,?,?)").bind(current.slug,status,message,session.email||null)
    ]);
    await audit(env,session,"status.service.update",current.slug,{status});
    return json({success:true},200,headers);
  }

  if(url.pathname==="/api/admin/incidents"){
    if(request.method==="GET"){
      const rows=await env.DB.prepare("SELECT * FROM status_incidents ORDER BY starts_at DESC LIMIT 100").all();
      return json({success:true,incidents:(rows.results||[]).map(presentIncident)},200,headers);
    }
    if(request.method==="POST"){
      const body=await readJsonBody(request,16_384);
      const title=text(body?.title,160),message=text(body?.message,2000);
      const impact=IMPACTS.has(body?.impact)?body.impact:"minor";
      const status=INCIDENT_STATES.has(body?.status)?body.status:"investigating";
      const affected=cleanServices(body?.affectedServices);
      if(!title||!message)return invalid(headers,"Title and message are required");
      const result=await env.DB.prepare("INSERT INTO status_incidents(title,impact,status,message,affected_services,created_by) VALUES(?,?,?,?,?,?)").bind(title,impact,status,message,JSON.stringify(affected),session.email||session.sub).run();
      const id=Number(result.meta?.last_row_id);
      await env.DB.prepare("INSERT INTO status_event_log(event_type,incident_id,status,message,actor_email) VALUES('incident.create',?,?,?,?)").bind(id,status,message,session.email||null).run();
      await audit(env,session,"status.incident.create",String(id),{title,impact,status,affected});
      return json({success:true,id},201,headers);
    }
    return methodNotAllowed(headers);
  }
  const incidentMatch=url.pathname.match(/^\/api\/admin\/incidents\/(\d+)$/);
  if(incidentMatch){
    if(request.method!=="PUT")return methodNotAllowed(headers);
    const body=await readJsonBody(request,16_384);
    const current=await env.DB.prepare("SELECT * FROM status_incidents WHERE id=?").bind(Number(incidentMatch[1])).first();
    if(!current)return json({success:false,error:{code:"INCIDENT_NOT_FOUND",message:"Incident not found"}},404,headers);
    const status=INCIDENT_STATES.has(body?.status)?body.status:current.status;
    const impact=IMPACTS.has(body?.impact)?body.impact:current.impact;
    const message=text(body?.message,2000)||current.message;
    const resolved=status==="resolved"?"CURRENT_TIMESTAMP":"NULL";
    await env.DB.prepare(`UPDATE status_incidents SET status=?,impact=?,message=?,resolved_at=${resolved},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,impact,message,current.id).run();
    await env.DB.prepare("INSERT INTO status_event_log(event_type,incident_id,status,message,actor_email) VALUES('incident.update',?,?,?,?)").bind(current.id,status,message,session.email||null).run();
    await audit(env,session,"status.incident.update",String(current.id),{status,impact});
    return json({success:true},200,headers);
  }

  if(url.pathname==="/api/admin/test-links"){
    if(request.method==="GET"){
      const rows=await env.DB.prepare("SELECT id,service,membership,expires_at,created_by,created_at,last_used_at,revoked_at FROM admin_test_links ORDER BY created_at DESC LIMIT 100").all();
      return json({success:true,links:rows.results||[]},200,headers);
    }
    if(request.method==="POST"){
      const body=await readJsonBody(request,8_192);
      const service=String(body?.service||"");
      const duration=Number(body?.durationMinutes);
      const membership=body?.membership===true;
      if(!TEST_SERVICES.has(service)||!Number.isInteger(duration)||duration<10||duration>120)
        return invalid(headers,"Choose a service and duration from 10 to 120 minutes");
      const id=crypto.randomUUID(),token=randomToken(32),tokenHash=await hash(token);
      const expiresAt=Math.floor(Date.now()/1000)+duration*60;
      await env.DB.prepare("INSERT INTO admin_test_links(id,token_hash,service,membership,expires_at,created_by) VALUES(?,?,?,?,?,?)").bind(id,tokenHash,service,Number(membership),expiresAt,session.email||session.sub).run();
      await audit(env,session,"test_link.create",id,{service,membership,durationMinutes:duration});
      const link=`https://api.sorasukt.com/auth/test?token=${encodeURIComponent(token)}`;
      return json({success:true,testLink:{id,service,membership,expiresAt,url:link}},201,headers);
    }
    return methodNotAllowed(headers);
  }
  const revokeMatch=url.pathname.match(/^\/api\/admin\/test-links\/([0-9a-f-]+)\/revoke$/);
  if(revokeMatch){
    if(request.method!=="POST")return methodNotAllowed(headers);
    await env.DB.prepare("UPDATE admin_test_links SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL").bind(revokeMatch[1]).run();
    await audit(env,session,"test_link.revoke",revokeMatch[1],{});
    return json({success:true},200,headers);
  }
  return null;
}

function presentIncident(row){return {...row,affected_services:safeArray(row.affected_services)}}
function safeArray(value){try{const parsed=JSON.parse(value||"[]");return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function cleanServices(value){return [...new Set((Array.isArray(value)?value:[]).map(String).filter(item=>/^[a-z0-9-]{1,50}$/.test(item)))].slice(0,20)}
function text(value,max){return typeof value==="string"?value.trim().slice(0,max):""}
function invalid(headers,message){return json({success:false,error:{code:"INVALID_INPUT",message}},400,headers)}
function methodNotAllowed(headers){return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers)}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}
async function audit(env,session,action,target,metadata){await env.DB.prepare("INSERT INTO admin_audit_log(actor_sub,actor_email,action,target,metadata) VALUES(?,?,?,?,?)").bind(session.sub,session.email||null,action,target||null,JSON.stringify(metadata||{})).run()}
function randomToken(bytes){const values=crypto.getRandomValues(new Uint8Array(bytes));let binary="";for(const value of values)binary+=String.fromCharCode(value);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function hash(value){const result=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(result)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
