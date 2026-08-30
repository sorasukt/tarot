const TTS_MODELS=[
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts"
];

const TAROT_VOICES=[
  "Sulafat",
  "Vindemiatrix",
  "Achernar",
  "Algieba",
  "Gacrux",
  "Charon",
  "Iapetus",
  "Schedar",
  "Kore",
  "Aoede",
  "Callirrhoe",
  "Umbriel",
  "Despina",
  "Erinome",
  "Sadaltager"
];

const RETRYABLE_STATUS=new Set([404,408,409,429,500,502,503,504]);
const MAX_TEXT_LENGTH=7000;

export async function handleTts(request,env,headers){
  if(request.method!=="POST")return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405,headers);
  if(!env.GEMINI_API_KEY)return json({success:false,error:{code:"TTS_NOT_CONFIGURED",message:"ระบบเสียงยังไม่พร้อมใช้งาน"}},503,headers);

  let body;
  try{body=await request.json()}catch{return json({success:false,error:{code:"INVALID_JSON",message:"ข้อมูลเสียงไม่ถูกต้อง"}},400,headers)}
  const text=String(body?.text||"").trim();
  if(!text)return json({success:false,error:{code:"TEXT_REQUIRED",message:"ไม่มีข้อความสำหรับอ่านออกเสียง"}},400,headers);
  if(text.length>MAX_TEXT_LENGTH)return json({success:false,error:{code:"TEXT_TOO_LONG",message:"ข้อความยาวเกินกว่าที่ระบบเสียงรองรับ"}},413,headers);

  const preferredVoice=normalizeVoice(body?.voice);
  const voices=[preferredVoice,...TAROT_VOICES].filter((voice,index,list)=>voice&&list.indexOf(voice)===index);
  const prompt=buildTarotNarrationPrompt(text);
  let lastStatus=503;

  for(let modelIndex=0;modelIndex<TTS_MODELS.length;modelIndex+=1){
    const model=TTS_MODELS[modelIndex];
    for(let voiceIndex=0;voiceIndex<voices.length;voiceIndex+=1){
      const voice=voices[voiceIndex];
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "x-goog-api-key":env.GEMINI_API_KEY,
            "Api-Revision":"2026-05-20"
          },
          body:JSON.stringify({
            model,
            input:prompt,
            response_format:{type:"audio",mime_type:"audio/wav",delivery:"inline"},
            generation_config:{speech_config:[{voice}]}
          }),
          signal:controller.signal
        });
        lastStatus=response.status;
        if(response.ok){
          const raw=await response.json();
          const audio=extractAudio(raw);
          if(!audio?.data)throw new Error("TTS_AUDIO_MISSING");
          const bytes=base64ToBytes(audio.data);
          const outHeaders=new Headers(headers);
          outHeaders.set("Content-Type",audio.mimeType||"audio/wav");
          outHeaders.set("Content-Length",String(bytes.byteLength));
          outHeaders.set("X-Tarot-TTS-Model",model);
          outHeaders.set("X-Tarot-TTS-Voice",voice);
          outHeaders.set("Cache-Control","private, no-store");
          if(modelIndex>0||voiceIndex>0)console.log(JSON.stringify({message:"Gemini TTS fallback succeeded",model,voice,modelAttempt:modelIndex+1,voiceAttempt:voiceIndex+1}));
          return new Response(bytes,{status:200,headers:outHeaders});
        }

        const errorText=await response.text().catch(()=>"");
        const voiceSpecific=response.status===400&&/voice/i.test(errorText);
        console.warn(JSON.stringify({message:"Gemini TTS attempt failed",model,voice,status:response.status,voiceSpecific,retryable:RETRYABLE_STATUS.has(response.status)}));
        if(voiceSpecific)continue;
        if(RETRYABLE_STATUS.has(response.status))break;
        return json({success:false,error:{code:"TTS_REQUEST_FAILED",message:"ไม่สามารถสร้างเสียงอ่านไพ่ได้ในขณะนี้"}},response.status,headers);
      }catch(error){
        const retryable=error?.name==="AbortError"||error?.name==="TypeError"||error?.message==="TTS_AUDIO_MISSING";
        console.warn(JSON.stringify({message:"Gemini TTS request error",model,voice,error:error?.name||error?.message||"error",retryable}));
        if(retryable)break;
        return json({success:false,error:{code:"TTS_REQUEST_FAILED",message:"ไม่สามารถสร้างเสียงอ่านไพ่ได้ในขณะนี้"}},502,headers);
      }finally{clearTimeout(timer)}
    }
  }

  return json({success:false,error:{code:"TTS_CAPACITY_EXHAUSTED",message:"ระบบเสียงกำลังมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่อีกครั้งภายหลัง"}},lastStatus===429?429:503,headers);
}

export function ttsModelChain(){return [...TTS_MODELS]}
export function tarotVoiceChain(){return [...TAROT_VOICES]}

function normalizeVoice(value){
  const requested=String(value||"").trim();
  if(!requested)return TAROT_VOICES[0];
  return TAROT_VOICES.find(voice=>voice.toLowerCase()===requested.toLowerCase())||TAROT_VOICES[0];
}

function buildTarotNarrationPrompt(text){
  return [
    "อ่านเนื้อหาต่อไปนี้เป็นภาษาไทยด้วยน้ำเสียงสงบ อบอุ่น เป็นธรรมชาติ และน่าเชื่อถือ",
    "ให้ความรู้สึกเหมือนนักอ่านไพ่ที่เป็นมิตร ไม่ทำให้น่ากลัว ไม่เร่งรีบ และไม่แสดงอารมณ์เกินจริง",
    "พูดช้ากว่าการสนทนาปกติเล็กน้อย เว้นจังหวะระหว่างหัวข้อ และอ่านเนื้อหาตามต้นฉบับโดยไม่เพิ่มคำทำนายใหม่",
    "ข้อความสำหรับอ่าน:",
    text
  ].join("\n\n");
}

function extractAudio(raw){
  const direct=raw?.output_audio||raw?.interaction?.output_audio;
  if(direct?.data)return {data:direct.data,mimeType:direct.mime_type||direct.mimeType||"audio/wav"};
  const outputs=raw?.outputs||raw?.interaction?.outputs||[];
  for(let index=outputs.length-1;index>=0;index-=1){
    const item=outputs[index];
    const audio=item?.audio||item?.output_audio||item;
    if(audio?.data&&(/audio/i.test(audio?.mime_type||audio?.mimeType||item?.type||"audio")))return {data:audio.data,mimeType:audio.mime_type||audio.mimeType||"audio/wav"};
  }
  return null;
}

function base64ToBytes(value){
  const binary=atob(value);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

function json(data,status,headers){
  const responseHeaders=new Headers(headers);responseHeaders.set("Content-Type","application/json; charset=utf-8");
  return new Response(JSON.stringify(data),{status,headers:responseHeaders});
}
