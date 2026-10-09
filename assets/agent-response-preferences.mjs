const allowed=new Set(['concise','evidence','actions']);
export function createResponsePreferences(storage,key){
 const normalize=value=>Array.isArray(value)?[...new Set(value.filter(x=>allowed.has(x)))].slice(0,3):[];
 let values=[];try{values=normalize(JSON.parse(storage.getItem(key)||'[]'))}catch{}
 return {get:()=>[...values],set(code,enabled){if(!allowed.has(code))throw Error('偏好无效');values=enabled?normalize([...values,code]):values.filter(x=>x!==code);try{storage.setItem(key,JSON.stringify(values));return true}catch{return false}},clear(){values=[];try{storage.removeItem(key);return true}catch{return false}}};
}
