// Storage has a deadline. A locked/private IndexedDB must never trap the game on loading.
export class SalonMemory {
 constructor(){this.db=null;this.persistent=false;this.photos=[];this.current=null;this.problem=false;this.ready=null;}
 open(){if(this.ready)return this.ready;this.ready=this.initialize();return this.ready;}
 async initialize(){
  try{this.db=await new Promise((resolve,reject)=>{let settled=false;const q=indexedDB.open('little-salon',1),timer=setTimeout(()=>{settled=true;reject(new Error('storage timeout'))},1500);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('photos'))q.result.createObjectStore('photos',{keyPath:'id'});if(!q.result.objectStoreNames.contains('settings'))q.result.createObjectStore('settings')};q.onsuccess=()=>{clearTimeout(timer);if(settled){q.result.close();return}settled=true;resolve(q.result)};q.onerror=q.onblocked=()=>{clearTimeout(timer);settled=true;reject(q.error||new Error('blocked'))}});
   this.db.onversionchange=()=>{this.db.close();this.db=null;this.persistent=false;this.problem=true};
   this.photos=(await this.request('photos','readonly',s=>s.getAll())).filter(p=>p&&typeof p.id==='string'&&typeof p.image==='string'&&p.state&&Number.isFinite(p.created)).sort((a,b)=>b.created-a.created);this.current=await this.request('settings','readonly',s=>s.get('current'));this.persistent=true;
  }catch{this.db?.close();this.db=null;this.persistent=false;this.problem=true}return this;
 }
 request(store,mode,run){return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,mode),q=run(tx.objectStore(store)),timer=setTimeout(()=>{try{tx.abort()}catch{}reject(new Error('transaction timeout'))},2000);tx.oncomplete=()=>{clearTimeout(timer);resolve(q.result)};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error)}})}
 async draft(state){await this.ready;this.current=structuredClone(state);if(!this.db)return;try{await this.request('settings','readwrite',s=>s.put(state,'current'))}catch{this.problem=true;this.persistent=false}}
 async add(photo){await this.ready;if(this.photos.length>=48)return false;try{if(this.db)await this.request('photos','readwrite',s=>s.put(photo));else this.problem=true}catch{this.problem=true;this.persistent=false}this.photos.unshift(photo);return true}
 async remove(id){await this.ready;try{if(this.db)await this.request('photos','readwrite',s=>s.delete(id))}catch{this.problem=true;return false}this.photos=this.photos.filter(p=>p.id!==id);return true}
}
