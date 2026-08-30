const DEFAULT_MODEL="gemini-3.6-flash";
const RATE_LIMIT_FALLBACKS=["gemini-2.5-flash","gemini-2.5-flash-lite","gemini-3.5-flash","gemini-3.1-flash-lite","gemini-3.5-flash-lite"];

export class GeminiCapacityError extends Error{
  constructor(){super("All Gemini models are temporarily unavailable");this.name="GeminiCapacityError";this.code="AI_CAPACITY_EXHAUSTED"}
}

export class GeminiHttpError extends Error{
  constructor(status){super(`Gemini request failed with status ${status}`);this.name="GeminiHttpError";this.status=status}
}

export function geminiModelChain(env){
  return [...new Set([env.GEMINI_MODEL||DEFAULT_MODEL,...RATE_LIMIT_FALLBACKS])];
}

export function geminiCacheVersion(env){return geminiModelChain(env).join("|")}

export async function generateGeminiJson(env,{system,prompt,schema,maxOutputTokens=2048,timeoutMs=60000,perModelTimeoutMs=10000}){
  const models=geminiModelChain(env);
  const deadline=Date.now()+timeoutMs;
  const body=JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema,maxOutputTokens}});
  for(let index=0;index<models.length;index+=1){
    const model=models[index];
    const remainingMs=deadline-Date.now();
    if(remainingMs<=0)break;
    const fallbackAvailable=index<models.length-1;
    const controller=new AbortController();
    const attemptTimeout=setTimeout(()=>controller.abort(),Math.min(perModelTimeoutMs,remainingMs));
    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body,signal:controller.signal});
      if(isRetryableStatus(response.status)){
        if(response.body)await response.body.cancel().catch(()=>undefined);
        console.warn(JSON.stringify({message:"Gemini model unavailable; trying fallback",model,status:response.status,fallbackAvailable}));
        continue;
      }
      if(!response.ok){
        if(response.body)await response.body.cancel().catch(()=>undefined);
        throw new GeminiHttpError(response.status);
      }
      const raw=await response.json();
      const text=raw?.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"";
      const result=JSON.parse(text);
      if(!matchesSchema(result,schema))throw new Error("Gemini response is invalid");
      if(index>0)console.log(JSON.stringify({message:"Gemini fallback succeeded",model,attempt:index+1}));
      return {result,model};
    }catch(error){
      if(fallbackAvailable&&isRetryableError(error)){
        console.warn(JSON.stringify({message:"Gemini model request failed; trying fallback",model,error:error?.name||"error",fallbackAvailable:true}));
        continue;
      }
      if(!fallbackAvailable&&isRetryableError(error))break;
      throw error;
    }finally{
      clearTimeout(attemptTimeout);
    }
  }
  throw new GeminiCapacityError();
}

function isRetryableStatus(status){return [400,404,408,409,429,500,502,503,504].includes(status)}
function isRetryableError(error){return error?.name==="AbortError"||error?.name==="SyntaxError"||error?.name==="TypeError"||error?.message==="Gemini response is invalid"}
function matchesSchema(value,schema){
  if(!schema||typeof schema!=="object")return true;
  if(schema.type==="object"){
    if(!value||typeof value!=="object"||Array.isArray(value))return false;
    if(Array.isArray(schema.required)&&schema.required.some(key=>!(key in value)))return false;
    if(schema.additionalProperties===false&&Object.keys(value).some(key=>!schema.properties?.[key]))return false;
    return Object.entries(schema.properties||{}).every(([key,child])=>!(key in value)||matchesSchema(value[key],child));
  }
  if(schema.type==="array"){
    if(!Array.isArray(value))return false;
    if(Number.isInteger(schema.minItems)&&value.length<schema.minItems)return false;
    if(Number.isInteger(schema.maxItems)&&value.length>schema.maxItems)return false;
    return value.every(item=>matchesSchema(item,schema.items));
  }
  if(schema.type==="string"){
    if(typeof value!=="string")return false;
    if(Array.isArray(schema.enum)&&!schema.enum.includes(value))return false;
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))return false;
    return true;
  }
  return true;
}

export function capacityError(env){
  return {code:"AI_CAPACITY_EXHAUSTED",message:"ขณะนี้มีผู้ใช้งานพร้อมกันจำนวนมาก ทำให้บริการประมวลผลครบขีดจำกัดชั่วคราว โปรดลองใหม่ภายหลัง หากต้องการช่วยให้เรารองรับผู้ใช้ได้มากขึ้น คุณสามารถสนับสนุนเราได้",supportUrl:env.SUPPORT_URL||"https://buy.stripe.com/5kQ8wOgsb6EI7yC1MWbjW00",supportLabel:"สนับสนุนการพัฒนาระบบ"};
}
