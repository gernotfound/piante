import { describe, expect, it } from 'vitest';
import {
  calendarDate, emptyGarden, gardenStateSchema, isCalendarDate, plantDraftSchema,
  placeDraftSchema, eventDraftSchema
} from './schema';

const plant={id:'avocado_1',commonName:'Avocado Bacon',origin:'graft',status:'active'} as const;
describe('M1 botanical schemas',()=>{
  it('rejects malformed calendar dates while allowing leap days',()=>{
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('0099-02-28')).toBe(true);
    for(const value of ['2023-02-29','2024-13-01','2024-02-30','2024-1-1','2024-00-01','2024-01-00']) {
      expect(calendarDate.safeParse(value).success).toBe(false);
    }
  });
  it('rejects unknown and sensitive unmodeled properties',()=>{
    expect(plantDraftSchema.safeParse({...plant,secretToken:'password'}).success).toBe(false);
    for (const id of ['__proto__', 'constructor', 'toString']) {
      expect(plantDraftSchema.safeParse({...plant,id}).success).toBe(false);
      expect(plantDraftSchema.safeParse({...plant,motherId:id}).success).toBe(false);
    }
    expect(plantDraftSchema.safeParse({...plant,soilPhMin:8,soilPhMax:6}).success).toBe(false);
    expect(plantDraftSchema.safeParse({...plant,motherId:plant.id}).success).toBe(false);
    expect(plantDraftSchema.safeParse({...plant,potLiters:-3}).success).toBe(false);
  });
  it('requires pairs of precise coordinates',()=>{
    expect(placeDraftSchema.safeParse({id:'balcony',name:'Balcone',kind:'balcony',latitude:40.7}).success).toBe(false);
    expect(placeDraftSchema.safeParse({id:'balcony',name:'Balcone',kind:'balcony',latitude:40.7,longitude:14.6}).success).toBe(true);
  });
  it('rejects incompatible measurement types',()=>{
    expect(eventDraftSchema.safeParse({id:'e1',plantId:'p1',date:'2026-08-03',type:'care',heightCm:20}).success).toBe(false);
    expect(eventDraftSchema.safeParse({id:'e1',plantId:'p1',date:'2026-08-03',type:'measurement',heightCm:20}).success).toBe(true);
  });
  it('validates identities and prevents cyclic parentage',()=>{
    const base=emptyGarden();
    expect(gardenStateSchema.safeParse({...base,plants:{bad:{...plant,createdAt:1,updatedAt:1}}}).success).toBe(false);
    const plants={
      a:{...plant,id:'a',motherId:'b',createdAt:1,updatedAt:1},
      b:{...plant,id:'b',motherId:'a',createdAt:1,updatedAt:1}
    };
    expect(gardenStateSchema.safeParse({...base,plants}).success).toBe(false);
  });
});
