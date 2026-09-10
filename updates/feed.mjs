const endpoint='https://api.github.com/repos/sorasukt/tarot/pulls';
export function normalizePull(p,kind){
 if(!p||!Number.isSafeInteger(p.number)||p.number<1||typeof p.title!=='string')return null;
 if(kind==='merged'?!p.merged_at:p.state!=='open')return null;
 const date=kind==='merged'?p.merged_at:p.updated_at;
 return {number:p.number,title:p.title,date:Number.isNaN(Date.parse(date))?null:date,url:`https://github.com/sorasukt/tarot/pull/${p.number}`,draft:kind==='future'&&Boolean(p.draft)};
}
export async function fetchPage(kind,page,{fetcher=fetch,signal}={}){
 if(!['merged','future'].includes(kind)||!Number.isSafeInteger(page)||page<1)throw new Error('Invalid feed request');
 const response=await fetcher(`${endpoint}?state=${kind==='merged'?'closed':'open'}&sort=updated&direction=desc&per_page=100&page=${page}`,{signal,headers:{Accept:'application/vnd.github+json'}});
 if(!response.ok)throw new Error(response.status===403||response.status===429?'ขณะนี้โหลดข้อมูลบ่อยเกินไป กรุณาลองใหม่ภายหลัง':'เชื่อมต่อข้อมูลไม่สำเร็จ');
 const data=await response.json();if(!Array.isArray(data))throw new Error('ข้อมูลอัปเดตไม่สมบูรณ์');
 return {items:data.map(p=>normalizePull(p,kind)).filter(Boolean),hasNext:/(?:^|,)\s*<[^>]+>;\s*rel="next"/.test(response.headers.get('Link')||'')};
}
