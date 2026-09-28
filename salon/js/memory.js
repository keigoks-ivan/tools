// The album stays on this device. Storage failures never interrupt play.
export class SalonMemory {
 constructor(){this.db=null;this.persistent=false;this.photos=[];this.current=null;this.problem=false;}
 async open(){
  try{this.db=await new Promise((resolve,reject)=>{const q=indexedDB.open('little-salon',1);q.onupgradeneeded=()=>{q.result.createObjectStore('photos',{keyPath:'id'});q.result.createObjectStore('settings')};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('blocked'))});this.persistent=true;
   this.photos=(await this.request('photos','readonly',s=>s.getAll())).sort((a,b)=>b.created-a.created);this.current=await this.request('settings','readonly',s=>s.get('current'));
  }catch{this.problem=true}return this;
 }
 request(store,mode,run){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,mode),q=run(tx.objectStore(store));tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 async draft(state){this.current=state;if(!this.db)return;try{await this.request('settings','readwrite',s=>s.put(state,'current'))}catch{this.problem=true;this.persistent=false}}
 async add(photo){if(this.photos.length>=48)return false;try{if(this.db)await this.request('photos','readwrite',s=>s.put(photo));else this.problem=true}catch{this.problem=true;this.persistent=false}this.photos.unshift(photo);return true}
 async remove(id){try{if(this.db)await this.request('photos','readwrite',s=>s.delete(id))}catch{this.problem=true;return false}this.photos=this.photos.filter(p=>p.id!==id);return true}
}
