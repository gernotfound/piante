/** An Auth UID does not prove membership in Piante: a server-side grant is required. */
export type AccessState =
 | {status:'initializing'} | {status:'signed-out'} | {status:'checking';uid:string}
 | {status:'denied';uid:string} | {status:'authorized';uid:string;ownerScope:string}
 | {status:'error';message:string};
export interface AuthGateway {
 subscribe(listener:(uid:string|null,error?:Error)=>void):()=>void;
 getGrant(uid:string):Promise<boolean>;
 signIn():Promise<void>;
 signOut():Promise<void>;
}
const UID=/^[A-Za-z0-9_-]{1,96}$/;
/** Generation fence prevents a previous identity's late async grant from reopening the session. */
export class AuthSessionController {
 private generation=0;private current:AccessState={status:'initializing'};
 private listeners=new Set<(state:AccessState)=>void>();
 private release:(()=>void)|null=null;
 constructor(private readonly gateway:AuthGateway){}
 get state():AccessState{return this.current;}
 onChange(f:(state:AccessState)=>void):()=>void{
  this.listeners.add(f);f(this.current);return()=>{this.listeners.delete(f);};
 }
 private emit(s:AccessState):void{this.current=s;for(const l of this.listeners)l(s);}
 start():void{
  if(this.release)return;
  this.release=this.gateway.subscribe((uid,error)=>{
   const epoch=++this.generation;
   if(error){this.emit({status:'error',message:'Sessione non verificabile'});return;}
   if(uid===null){this.emit({status:'signed-out'});return;}
   if(!UID.test(uid)){this.emit({status:'error',message:'UID non valido'});return;}
   this.emit({status:'checking',uid});
   void this.gateway.getGrant(uid).then(enabled=>{
    if(epoch!==this.generation)return;
    this.emit(enabled?{status:'authorized',uid,ownerScope:'user:'+uid}:{status:'denied',uid});
   }).catch(()=>{
    if(epoch===this.generation)this.emit({status:'error',message:'Autorizzazione non verificabile'});
   });
  });
 }
 async signIn():Promise<void>{await this.gateway.signIn();}
 async signOut():Promise<void>{
  ++this.generation;this.emit({status:'signed-out'});
  try{await this.gateway.signOut();}
  catch{this.emit({status:'error',message:'Disconnessione Firebase fallita'});throw new Error('Disconnessione Firebase fallita');}
 }
 dispose():void{
  ++this.generation;this.release?.();this.release=null;this.emit({status:'signed-out'});this.listeners.clear();
 }
}
