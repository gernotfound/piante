import {describe,expect,it,vi} from 'vitest';
import {runPianteDeletionStep,MAX_DELETE_BATCH,type TrustedDeletionPort} from './deletionRunner';

function lab(initial:number=0){
  const privateDocs=new Map<string,Set<string>>([
    ['operations',new Set(Array.from({length:initial},(_,i)=>'op'+i))]
  ]);
  let root=true,grant=true,completed=false,busy=false,tombstone=false,external=false;
  const actions:string[]=[];
  const port:TrustedDeletionPort={
    async begin(){
      if(completed)return 'complete';
      if(busy)return 'busy';
      tombstone=true;busy=true;actions.push('tombstone');return 'acquired';
    },
    async noExternalArtifacts(){return !external;},
    async listPrivateCollections(){return [...privateDocs].filter(([,docs])=>docs.size>0).map(([name])=>name);},
    async listDocumentIds(_uid,collection,max){
      return [...(privateDocs.get(collection)??[])].slice(0,max);
    },
    async deleteDocuments(_uid,collection,ids){
      if(!tombstone)throw Error('No write barrier');
      const docs=privateDocs.get(collection);
      if(!docs)throw Error('Unknown collection');
      for(const id of ids)docs.delete(id);
      actions.push('delete:'+ids.length);
    },
    async deletePrivateRoot(){
      if(!tombstone)throw Error('No write barrier');
      root=false;actions.push('root');
    },
    async verifyPrivateEmpty(){
      return !root&&[...privateDocs.values()].every(docs=>docs.size===0);
    },
    async deleteGrant(){
      if(root||[...privateDocs.values()].some(docs=>docs.size))throw Error('Cloud not empty');
      grant=false;actions.push('grant');
    },
    async verifyGrantGone(){return !grant;},
    async markComplete(){
      if(root||grant)throw Error('Premature complete');
      completed=true;actions.push('complete');
    },
    async release(){
      busy=false;actions.push('release');
    }
  };
  return {
    port,actions,privateDocs,
    get root(){return root;},get grant(){return grant;},
    get completed(){return completed;},get tombstone(){return tombstone;},
    set external(value:boolean){external=value;},
    set busy(value:boolean){busy=value;}
  };
}
describe('M3c server-side Piante-only deletion LAB invariants (CRITICAL)',()=>{
  it('retains tombstone while deleting in bounded recoverable batches and removes grant last',async()=>{
    const env=lab(121);
    let count=0;
    while(!env.completed && count++<10){
      const result=await runPianteDeletionStep(env.port,'alice');
      expect(result.status).not.toBe('busy');
      expect(env.tombstone).toBe(true);
      if(!env.completed)expect(env.grant).toBe(true);
    }
    expect(count).toBe(4);
    expect(env.completed).toBe(true);
    expect(env.actions.filter(a=>a==='delete:50')).toHaveLength(2);
    expect(env.actions.filter(a=>a==='delete:21')).toHaveLength(1);
    expect(env.actions.indexOf('root')).toBeLessThan(env.actions.indexOf('grant'));
    expect(env.actions.indexOf('grant')).toBeLessThan(env.actions.indexOf('complete'));
    expect(await runPianteDeletionStep(env.port,'alice')).toEqual({
      status:'piante-data-cleared',deleted:0
    });
  });

  it('fences unknown private subcollections without touching any data or shared Auth',async()=>{
    const env=lab(2);
    env.privateDocs.set('unrecognized-media',new Set(['secret']));
    await expect(runPianteDeletionStep(env.port,'alice'))
      .rejects.toThrow('Unknown or duplicate');
    expect(env.privateDocs.get('operations')?.size).toBe(2);
    expect(env.privateDocs.get('unrecognized-media')?.size).toBe(1);
    expect(env.actions).toEqual(['tombstone','release']);
    expect(env.grant).toBe(true);
  });

  it('refuses to purge when public/Storage dependency inventory is incomplete',async()=>{
    const env=lab(2);env.external=true;
    await expect(runPianteDeletionStep(env.port,'alice'))
      .rejects.toThrow('Unknown public');
    expect(env.privateDocs.get('operations')?.size).toBe(2);
    expect(env.actions).toEqual(['tombstone','release']);
  });

  it('does not overlap work while another worker holds a lease',async()=>{
    const env=lab(2);env.busy=true;
    expect(await runPianteDeletionStep(env.port,'alice')).toEqual({status:'busy'});
    expect(env.actions).toEqual([]);
    expect(env.privateDocs.get('operations')?.size).toBe(2);
  });

  it('rejects malicious UID and unbounded batch size before any provider side effect',async()=>{
    const env=lab(1);
    await expect(runPianteDeletionStep(env.port,'bad/path')).rejects.toThrow('Invalid deletion UID');
    await expect(runPianteDeletionStep(env.port,'alice',51)).rejects.toThrow('Invalid deletion budget');
    await expect(runPianteDeletionStep(env.port,'alice',0)).rejects.toThrow('Invalid deletion budget');
    expect(env.actions).toEqual([]);
    expect(MAX_DELETE_BATCH).toBe(50);
  });

  it('preserves tombstone and available data when an administrative batch fails',async()=>{
    const env=lab(3);
    const original=env.port.deleteDocuments;
    env.port.deleteDocuments=vi.fn(async()=>{throw Error('Injected timeout');});
    await expect(runPianteDeletionStep(env.port,'alice')).rejects.toThrow('Injected timeout');
    expect(env.tombstone).toBe(true);
    expect(env.completed).toBe(false);
    expect(env.grant).toBe(true);
    expect(env.privateDocs.get('operations')?.size).toBe(3);
    env.port.deleteDocuments=original;
    expect(await runPianteDeletionStep(env.port,'alice')).toEqual({
      status:'incomplete',deleted:3
    });
    expect(await runPianteDeletionStep(env.port,'alice')).toEqual({
      status:'piante-data-cleared',deleted:0
    });
  });

  it('never declares complete when final proof fails, then resumes idempotently',async()=>{
    const env=lab();
    const previous=env.port.verifyPrivateEmpty;
    env.port.verifyPrivateEmpty=async()=>false;
    await expect(runPianteDeletionStep(env.port,'alice')).rejects.toThrow('still present');
    expect(env.completed).toBe(false);
    expect(env.grant).toBe(true);
    env.port.verifyPrivateEmpty=previous;
    expect(await runPianteDeletionStep(env.port,'alice')).toEqual({
      status:'piante-data-cleared',deleted:0
    });
  });

  it('refuses a forged complete job when its underlying private state reappears',async()=>{
    const env=lab();
    await runPianteDeletionStep(env.port,'alice');
    env.privateDocs.set('operations',new Set(['recreated']));
    await expect(runPianteDeletionStep(env.port,'alice'))
      .rejects.toThrow('proof contradicted');
  });
});
