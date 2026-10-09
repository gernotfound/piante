import { describe, expect, it, vi } from 'vitest';
import { AuthSessionController, type AuthGateway, type AccessState } from './session';

function setup(){
  let authCallback:(uid:string|null,error?:Error)=>void=()=>{};
  const watches:{uid:string;callback:(grant:boolean|null,error?:Error)=>void;closed:boolean}[]=[];
  const gateway:AuthGateway={
    subscribe(f){authCallback=f;return()=>{authCallback=()=>{};};},
    watchGrant(uid,callback){
      const watch={uid,callback,closed:false};
      watches.push(watch);
      return()=>{watch.closed=true;};
    },
    signIn:vi.fn().mockResolvedValue(undefined),
    signOut:vi.fn().mockResolvedValue(undefined)
  };
  const controller=new AuthSessionController(gateway);
  return {
    c:controller,gateway,watches,
    auth:(uid:string|null,error?:Error)=>authCallback(uid,error),
    grant:(enabled:boolean|null,index=watches.length-1,error?:Error)=>
      watches[index].callback(enabled,error)
  };
}
describe('M3f live invited owner authorization and revocation (CRITICAL)',()=>{
  it('never unlocks on Auth UID, cached/offline/unknown grants or a denied grant',()=>{
    const h=setup();
    h.c.start();
    h.auth('alice');
    expect(h.c.state).toEqual({status:'checking',uid:'alice'});
    h.grant(null);
    expect(h.c.state.status).toBe('checking');
    h.grant(false);
    expect(h.c.state).toEqual({status:'denied',uid:'alice'});
    h.grant(true);
    expect(h.c.state).toEqual({status:'authorized',uid:'alice',ownerScope:'user:alice'});
  });
  it('revokes an already visible private owner immediately when grant is disabled',()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    let privateVisible=h.c.state.status==='authorized';
    h.c.onChange(state=>{privateVisible=state.status==='authorized';});
    expect(privateVisible).toBe(true);
    h.grant(false);
    expect(privateVisible).toBe(false);
    expect(h.c.state).toEqual({status:'denied',uid:'alice'});
  });
  it('closes access when a server listener becomes cached, offline or errors',()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    h.grant(null);expect(h.c.state).toEqual({status:'checking',uid:'alice'});
    h.grant(true);expect(h.c.state.status).toBe('authorized');
    h.grant(null,0,new Error('permission denied'));
    expect(h.c.state).toEqual({status:'error',message:'Autorizzazione non verificabile'});
  });
  it('fences stale listener callbacks across user switches and token refreshes',()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    h.auth('bob');
    expect(h.watches[0].closed).toBe(true);
    expect(h.c.state).toEqual({status:'checking',uid:'bob'});
    h.grant(true,0);expect(h.c.state.status).toBe('checking');
    h.grant(true,1);expect(h.c.state).toEqual({status:'authorized',uid:'bob',ownerScope:'user:bob'});
    h.auth('bob'); // refresh: prior server proof is not carried forward
    expect(h.watches[1].closed).toBe(true);
    expect(h.c.state).toEqual({status:'checking',uid:'bob'});
    h.grant(true,1);expect(h.c.state.status).toBe('checking');
    h.grant(true,2);expect(h.c.state.status).toBe('authorized');
  });
  it('blocks private state immediately on offline auth transport failure and rechecks on reconnect',()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    h.auth(null,new Error('browser offline'));
    expect(h.watches[0].closed).toBe(true);
    expect(h.c.state).toEqual({status:'error',message:'Sessione non verificabile'});
    h.auth('alice');
    expect(h.c.state).toEqual({status:'checking',uid:'alice'});
    h.grant(true,1);expect(h.c.state.status).toBe('authorized');
  });
  it('never reauthorizes from a stale event after logout or disposal',async()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    await h.c.signOut();
    expect(h.c.state).toEqual({status:'signed-out'});
    expect(h.watches[0].closed).toBe(true);
    h.grant(true,0);
    expect(h.c.state.status).toBe('signed-out');
    h.auth('bob'); // late auth callback after explicit logout is fenced
    expect(h.watches).toHaveLength(1);
    expect(h.c.state.status).toBe('signed-out');
    await h.c.signIn();
    h.auth('bob');h.grant(true,1);
    const seen:AccessState[]=[];h.c.onChange(state=>seen.push(state));
    h.c.dispose();
    const count=seen.length;
    h.grant(true,1);
    expect(seen).toHaveLength(count);
    expect(h.c.state.status).toBe('signed-out');
    expect(h.gateway.signOut).toHaveBeenCalledOnce();
  });
  it('does not accept a lingering Auth callback after an explicit logout',async()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    await h.c.signOut();
    h.auth('alice'); // stale SDK user before sign-out propagation
    expect(h.c.state).toEqual({status:'signed-out'});
    expect(h.watches).toHaveLength(1);
    await h.c.signIn();h.auth('alice');
    expect(h.c.state.status).toBe('checking');
    h.grant(true,1);expect(h.c.state.status).toBe('authorized');
  });
  it('does not reopen after a disposed SDK subscription delivers a late event',()=>{
    const h=setup();h.c.start();h.auth('alice');h.grant(true);
    h.c.dispose();
    h.auth('alice');
    expect(h.c.state.status).toBe('signed-out');
    expect(h.watches).toHaveLength(1);
  });
  it('rejects malformed UID before listening to any grant',()=>{
    const h=setup();h.c.start();h.auth('wrong/path');
    expect(h.c.state.status).toBe('error');
    expect(h.watches).toHaveLength(0);
  });
  it('fails closed if the grant listener itself throws during setup',()=>{
    let auth:(uid:string|null)=>void=()=>{};
    const gateway:AuthGateway={
      subscribe(f){auth=f;return()=>{};},
      watchGrant(){throw new Error('unavailable');},
      signIn:async()=>{},signOut:async()=>{}
    };
    const c=new AuthSessionController(gateway);c.start();auth('alice');
    expect(c.state).toEqual({status:'error',message:'Autorizzazione non verificabile'});
  });
  it('sign-out errors do not leave previously authorized data visible',async()=>{
    const h=setup();
    h.gateway.signOut=vi.fn().mockRejectedValue(new Error('Firebase down'));
    h.c.start();h.auth('alice');h.grant(true);
    await expect(h.c.signOut()).rejects.toThrow('Disconnessione Firebase fallita');
    expect(h.c.state.status).toBe('error');
    h.grant(true,0);
    expect(h.c.state.status).toBe('error');
  });
});
