import { describe, expect, it } from 'vitest';
import { applyDomainOperation, replayOperations } from './operations';
import { emptyGarden } from './schema';

const avocado={id:'avocado_1',commonName:'Avocado Bacon',origin:'graft',status:'active'} as const;
const plantCreate={type:'plant.create',plant:avocado} as const;
describe('M1 domain operations',()=>{
  it('creates immutable-identity plants and replays durable operations exactly',()=>{
    const ops=[
      {operation:{type:'place.create',place:{id:'balcone',name:'Balcone',kind:'balcony'}} as const,appliedAt:100},
      {operation:plantCreate,appliedAt:101},
      {operation:{type:'plant.patch',id:'avocado_1',patch:{placeId:'balcone',soilPhMin:5,soilPhMax:7}} as const,appliedAt:102},
      {operation:{type:'event.add',event:{id:'log1',plantId:'avocado_1',date:'2026-10-01',type:'measurement',heightCm:120}} as const,appliedAt:103}
    ];
    const replayed=replayOperations(emptyGarden(),ops);
    expect(replayed.plants.avocado_1.placeId).toBe('balcone');
    expect(replayed.events.log1.heightCm).toBe(120);
    let reduced=emptyGarden();
    for(const entry of ops) reduced=applyDomainOperation(reduced,entry.operation,entry.appliedAt);
    expect(replayed).toEqual(reduced);
  });
  it('rejects duplicate IDs and orphan events without mutating input',()=>{
    const s=applyDomainOperation(emptyGarden(),plantCreate,1);
    expect(()=>applyDomainOperation(s,plantCreate,2)).toThrow('duplicato');
    expect(()=>applyDomainOperation(s,{type:'event.add',event:{id:'e1',plantId:'other',date:'2026-09-01',type:'care'}},2)).toThrow();
    expect(Object.keys(s.events)).toHaveLength(0);
  });
  it('clears optional fields but preserves unspecified fields',()=>{
    const s=applyDomainOperation(emptyGarden(),{type:'plant.create',plant:{...avocado,notes:'riservato',purchasePrice:25}},2);
    const next=applyDomainOperation(s,{type:'plant.patch',id:'avocado_1',patch:{notes:null}},1);
    expect(next.plants.avocado_1.notes).toBeUndefined();
    expect(next.plants.avocado_1.purchasePrice).toBe(25);
    expect(next.plants.avocado_1.updatedAt).toBeGreaterThan(s.plants.avocado_1.updatedAt);
  });
  it('rejects cycles, invalid references, explicit undefined and identity mutations',()=>{
    const s=applyDomainOperation(emptyGarden(),plantCreate,1);
    expect(()=>applyDomainOperation(s,{type:'plant.patch',id:'avocado_1',patch:{motherId:'missing'}},2)).toThrow();
    expect(()=>applyDomainOperation(s,{type:'plant.patch',id:'avocado_1',patch:{notes:undefined}},2)).toThrow('Undefined');
    expect(()=>applyDomainOperation(s,{type:'plant.patch',id:'avocado_1',patch:{id:'hijack'}},2)).toThrow();
  });
  it('rejects parent cycles introduced by patches',()=>{
    let s=applyDomainOperation(emptyGarden(),plantCreate,1);
    s=applyDomainOperation(s,{type:'plant.create',plant:{...avocado,id:'child',motherId:'avocado_1'}},2);
    expect(()=>applyDomainOperation(s,{type:'plant.patch',id:'avocado_1',patch:{motherId:'child'}},3)).toThrow();
  });
  it('enforces safe bounds on events and empty patches',()=>{
    const s=applyDomainOperation(emptyGarden(),plantCreate,1);
    expect(()=>applyDomainOperation(s,{type:'plant.patch',id:'avocado_1',patch:{}},2)).toThrow('vuota');
    expect(()=>applyDomainOperation(s,{type:'event.add',event:{id:'e',plantId:'avocado_1',date:'2026-04-31',type:'measurement',heightCm:4}},2)).toThrow();
  });
});
