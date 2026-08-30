const CACHE_RETENTION_DAYS=60;

export async function getMemberAiResult(env,userSub,feature,input){
  if(!env.DB||!userSub)return {cached:false,key:"",value:null};
  const key=await createCacheKey(feature,input);
  try{
    const row=await env.DB.prepare("SELECT result_json FROM member_ai_results WHERE user_sub=? AND feature=? AND request_hash=? AND expires_at>CURRENT_TIMESTAMP")
      .bind(userSub,feature,key).first();
    if(!row?.result_json)return {cached:false,key,value:null};
    try{return {cached:true,key,value:JSON.parse(row.result_json)}}
    catch{
      await env.DB.prepare("DELETE FROM member_ai_results WHERE user_sub=? AND feature=? AND request_hash=?")
        .bind(userSub,feature,key).run();
    }
  }catch(error){
    console.error(JSON.stringify({message:"Member AI cache read failed",feature,error:error?.message||"error"}));
  }
  return {cached:false,key,value:null};
}

export async function saveMemberAiResult(env,userSub,feature,key,value){
  if(!env.DB||!userSub||!key)return;
  try{
    await env.DB.prepare(`INSERT INTO member_ai_results(user_sub,feature,request_hash,result_json,expires_at)
      VALUES(?,?,?,?,datetime('now',?))
      ON CONFLICT(user_sub,feature,request_hash) DO UPDATE SET
        result_json=excluded.result_json,
        updated_at=CURRENT_TIMESTAMP,
        expires_at=excluded.expires_at`)
      .bind(userSub,feature,key,JSON.stringify(value),`+${CACHE_RETENTION_DAYS} days`).run();
  }catch(error){
    console.error(JSON.stringify({message:"Member AI cache write failed",feature,error:error?.message||"error"}));
  }
}

export async function createCacheKey(feature,input){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${feature}:${stableJson(input)}`));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

function stableJson(value){
  if(Array.isArray(value))return `[${value.map(stableJson).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
