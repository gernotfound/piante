import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {LocalGardenRepository} from '../storage/localRepository';
import {AuthSessionController,type AuthGateway} from './session';
let count=0;

describe('M3f authorization epoch fences IndexedDB writes (CRITICAL)',()=>{
  it('blocks local commits after live grant revocation without damaging the existing journal',async()=>{
    let emitAuth:(uid:string|null)=>void=()=>{};
    let emitGrant:(enabled:boolean|null)=>void=()=>{};
    const gateway:AuthGateway={
      subscribe(cb){emitAuth=cb;return()=>{};},
      watchGrant(_uid,cb){emitGrant=cb;return()=>{};},
      signIn:async()=>{},signOut:async()=>{}
    };
    const c=new AuthSessionController(gateway);
    c.start();emitAuth('alice');emitGrant(true);
    const repo=new LocalGardenRepository('user:alice',{dbName:'m3f-auth-fence-'+(++count),now:()=>100});
    const authorized=()=>c.state.status==='authorized'&&c.state.uid==='alice';
    await repo.commit({type:'plant.create',plant:{
      id:'avocado',commonName:'Avocado',origin:'seed',status:'active'
    }},authorized);
    const before=await repo.read();
    emitGrant(false);expect(authorized()).toBe(false);
    await expect(repo.commit({type:'plant.patch',id:'avocado',patch:{notes:'should not save'}},authorized))
      .rejects.toThrow('Sessione cambiata');
    expect(await repo.read()).toEqual(before);
  });
  it('invalidates the owner fence while the auth server grant is cached',async()=>{
    let auth:(uid:string|null)=>void=()=>{};
    let grant:(enabled:boolean|null)=>void=()=>{};
    const c=new AuthSessionController({
      subscribe(cb){auth=cb;return()=>{};},
      watchGrant(_uid,cb){grant=cb;return()=>{};},
      signIn:async()=>{},signOut:async()=>{}
    });
    c.start();auth('alice');grant(true);
    expect(c.state.status).toBe('authorized');
    grant(null);
    expect(c.state).toEqual({status:'checking',uid:'alice'});
  });
});
