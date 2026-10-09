/** An Auth UID alone does not prove Piante membership. Only a server-backed,
 * continuously observed grant can unlock the invited-only local prototype. */
export type AccessState =
 | {status:'initializing'} | {status:'signed-out'} | {status:'checking';uid:string}
 | {status:'denied';uid:string} | {status:'authorized';uid:string;ownerScope:string}
 | {status:'error';message:string};

export interface AuthGateway {
  /**
   * Fires on Firebase ID token/identity changes and when transport becomes
   * untrustworthy (offline); caller must invalidate the previous epoch.
   */
  subscribe(listener:(uid:string|null,error?:Error)=>void):()=>void;
  /**
   * null = unverified/cached/offline. true/false MUST be a fresh server result.
   * On listen/permission failure pass an error, never reuse cached grant.
   */
  watchGrant(uid:string,listener:(enabled:boolean|null,error?:Error)=>void):()=>void;
  signIn():Promise<void>;
  signOut():Promise<void>;
}
const UID=/^[A-Za-z0-9_-]{1,96}$/;

/** Async & listener generation fence. Never exposes private state without
 * a live server confirmation; a downgrade invalidates the owner immediately. */
export class AuthSessionController {
  private generation=0;
  private disposed=false;
  private explicitlySignedOut=false;
  private current:AccessState={status:'initializing'};
  private listeners=new Set<(state:AccessState)=>void>();
  private releaseAuth:(()=>void)|null=null;
  private releaseGrant:(()=>void)|null=null;
  constructor(private readonly gateway:AuthGateway){}
  get state():AccessState{return this.current;}
  onChange(f:(state:AccessState)=>void):()=>void{
    this.listeners.add(f);f(this.current);return()=>{this.listeners.delete(f);};
  }
  private emit(state:AccessState):void {
    this.current=state;
    for(const listener of this.listeners)listener(state);
  }
  private closeGrant():void {
    const release=this.releaseGrant;
    this.releaseGrant=null;
    release?.();
  }
  private onAuth(uid:string|null,error?:Error):void {
    if(this.disposed)return;
    const epoch=++this.generation;
    this.closeGrant(); // never retain a previous UID's grant during changes
    if(this.explicitlySignedOut){this.emit({status:'signed-out'});return;}
    if(error){this.emit({status:'error',message:'Sessione non verificabile'});return;}
    if(uid===null){this.emit({status:'signed-out'});return;}
    if(!UID.test(uid)){this.emit({status:'error',message:'UID non valido'});return;}
    this.emit({status:'checking',uid});
    try{
      const unsubscribe=this.gateway.watchGrant(uid,(enabled,grantError)=>{
        if(epoch!==this.generation)return;
        if(grantError){
          // A terminal listener failure must NEVER be followed by another
          // successful callback from that compromised listener generation.
          ++this.generation;
          this.closeGrant();
          this.emit({status:'error',message:'Autorizzazione non verificabile'});
        }else if(enabled===null){
          // Offline/cached grants NEVER maintain unlocked local/private UI.
          this.emit({status:'checking',uid});
        }else if(enabled){
          this.emit({status:'authorized',uid,ownerScope:'user:'+uid});
        }else{
          this.emit({status:'denied',uid});
        }
      });
      if(epoch!==this.generation)unsubscribe();
      else this.releaseGrant=unsubscribe;
    }catch{
      if(epoch===this.generation)this.emit({status:'error',message:'Autorizzazione non verificabile'});
    }
  }
  start():void {
    if(this.disposed||this.releaseAuth)return;
    this.releaseAuth=this.gateway.subscribe((uid,error)=>this.onAuth(uid,error));
  }
  async signIn():Promise<void>{
    if(this.disposed)throw new Error('Sessione terminata');
    this.explicitlySignedOut=false;
    try{await this.gateway.signIn();}
    catch(error){this.explicitlySignedOut=true;this.onAuth(null);throw error;}
  }
  async signOut():Promise<void>{
    if(this.disposed)throw new Error('Sessione terminata');
    this.explicitlySignedOut=true;
    ++this.generation;
    this.closeGrant();
    this.emit({status:'signed-out'});
    try{await this.gateway.signOut();}
    catch{
      this.emit({status:'error',message:'Disconnessione Firebase fallita'});
      throw new Error('Disconnessione Firebase fallita');
    }
  }
  dispose():void{
    this.disposed=true;
    ++this.generation;
    this.closeGrant();
    const release=this.releaseAuth;
    this.releaseAuth=null;
    release?.();
    this.emit({status:'signed-out'});
    this.listeners.clear();
  }
}
