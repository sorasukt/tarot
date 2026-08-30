const DEFAULT_GEOCODING_BASE="https://geocoding-api.open-meteo.com/v1";

export async function autocompletePlaces(env,input){
  const query=String(input||"").trim();
  if(query.length<2)return [];
  const url=new URL(`${apiBase(env)}/search`);
  url.searchParams.set("name",query);
  url.searchParams.set("count","6");
  url.searchParams.set("language","th");
  url.searchParams.set("format","json");
  const data=await fetchJson(url);
  return (Array.isArray(data.results)?data.results:[]).map(normalizeSuggestion).filter(Boolean);
}

export async function resolvePlace(env,placeId){
  const id=String(placeId||"").trim();
  if(!/^\d+$/.test(id))throw new Error("Invalid public geocoding place id");
  const url=new URL(`${apiBase(env)}/get`);
  url.searchParams.set("id",id);
  url.searchParams.set("language","th");
  const data=await fetchJson(url);
  const lat=Number(data.latitude),lng=Number(data.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("Place location is unavailable");
  return {placeId:String(data.id||id),name:displayName(data),lat,lng,timezone:validTimezone(data.timezone)?data.timezone:"Asia/Bangkok"};
}

function normalizeSuggestion(place){
  const id=Number(place?.id),lat=Number(place?.latitude),lng=Number(place?.longitude);
  if(!Number.isInteger(id)||!Number.isFinite(lat)||!Number.isFinite(lng)||!place?.name)return null;
  const secondary=locationParts(place).join(", ");
  return {placeId:String(id),text:[place.name,secondary].filter(Boolean).join(", "),mainText:String(place.name),secondaryText:secondary};
}

function displayName(place){
  return [place?.name,...locationParts(place)].filter(Boolean).join(", ");
}

function locationParts(place){
  const name=String(place?.name||"").toLocaleLowerCase();
  return [place?.admin2,place?.admin1,place?.country].map(value=>String(value||"").trim()).filter((value,index,items)=>value&&value.toLocaleLowerCase()!==name&&items.indexOf(value)===index);
}

function validTimezone(value){
  if(typeof value!=="string"||value.length>80)return false;
  try{new Intl.DateTimeFormat("en",{timeZone:value}).format();return true}catch{return false}
}

function apiBase(env){return String(env?.GEOCODING_API_BASE||DEFAULT_GEOCODING_BASE).replace(/\/$/,"")}

async function fetchJson(url){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(url.toString(),{headers:{Accept:"application/json"},signal:controller.signal});
    if(!response.ok)throw new Error(`Public geocoding request failed: ${response.status}`);
    const data=await response.json();
    if(data?.error)throw new Error("Public geocoding returned an error");
    return data;
  }finally{clearTimeout(timeout)}
}
