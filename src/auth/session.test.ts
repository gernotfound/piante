import { describe, expect, it, vi } from 'vitest';
import { AuthSessionController, type AuthGateway, type AccessState } from './session';
function setup(){
 let callback:((uid:string|null)=>void)=()=>{};
 const grants=new Map<string,(yes:boolean)=>void>();
 const gateway:AuthGateway={
  subscribe(f){callback=f;return()=>{callback=()=>{};};},
  getGrant(uid){return new Promise(resolve=>{grants.set(uid,resolve);});},
  signIn:vi.fn().mockResolvedValue(undefined),
  signOut:vi.fn().mockResolvedValue(undefined)
 };
 return {c:new AuthSessionController(gateway),gateway,
  auth:(uid:string|null)=>callback(uid),grant:(uid:string,yes:boolean)=>grants.get(uid)?.(yes)};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('M2 identity and owner fence',()=>{
 it('requires positive grant before granting access',async()=>{
  const h=setup();h.c.start();h.auth('alice');
  expect(h.c.state.status).toBe('checking');
  h.grant('alice',true);await settle();
  expect(h.c.state).toEqual({status:'authorized',uid:'alice',ownerScope:'user:alice'});
 });
 it('rejects unauthorized and invalid users',async()=>{
  const h=setup();h.c.start();h.auth('other');h.grant('other',false);await settle();
  expect(h.c.state).toEqual({status:'denied',uid:'other'});
  h.auth('path/injection');expect(h.c.state.status).toBe('error');
 });
 it('invalidates prior async access when changing user or signing out',async()=>{
  const h=setup();h.c.start();h.auth('alice');h.auth('bob');
  h.grant('alice',true);await settle();expect(h.c.state).toEqual({status:'checking',uid:'bob'});
  h.auth(null);h.grant('bob',true);await settle();expect(h.c.state).toEqual({status:'signed-out'});
 });
 it('closes local access immediately on logout',async()=>{
  const h=setup();h.c.start();h.auth('alice');h.grant('alice',true);await settle();
  await h.c.signOut();expect(h.c.state).toEqual({status:'signed-out'});
  expect(h.gateway.signOut).toHaveBeenCalledOnce();
 });
 it('closes on failed authorization',async()=>{
  let f:(uid:string|null)=>void=()=>{};
  const gateway:AuthGateway={subscribe(cb){f=cb;return()=>{};},getGrant:async()=>{throw new Error('offline');},signIn:async()=>{},signOut:async()=>{}};
  const c=new AuthSessionController(gateway);c.start();f('alice');await settle();
  expect(c.state.status).toBe('error');
 });
 it('invalidates outstanding grants on dispose',async()=>{
  const h=setup();const seen:AccessState[]=[];h.c.onChange(s=>seen.push(s));
  h.c.start();h.auth('alice');h.c.dispose();const n=seen.length;
  h.grant('alice',true);await settle();expect(seen.length).toBe(n);
 });
});
