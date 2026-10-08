import { z } from 'zod';

// These keys collide with the inherited prototype of plain JS record maps.
const RESERVED_IDS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
]);
export const ENTITY_ID = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/)
  .refine(id => !RESERVED_IDS.has(id), 'ID riservato');
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const name = z.string().trim().min(1).max(120);
const optionalText = (n: number) => z.string().trim().max(n).optional();
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const x = new Date(0);
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCFullYear(y, m - 1, d);
  return x.getUTCFullYear() === y && x.getUTCMonth() + 1 === m && x.getUTCDate() === d;
}
export const calendarDate = z.string().refine(isCalendarDate, 'Data calendario non valida');
const plantFields = {
  id: ENTITY_ID, commonName: name, scientificName: optionalText(160), cultivar: optionalText(120),
  origin: z.enum(['seed', 'cutting', 'graft', 'purchased', 'unknown']),
  status: z.enum(['active', 'archived', 'dead']),
  sownOn: calendarDate.optional(), acquiredOn: calendarDate.optional(),
  motherId: ENTITY_ID.optional(), fatherId: ENTITY_ID.optional(), placeId: ENTITY_ID.optional(),
  potLiters: z.number().finite().positive().max(100000).optional(),
  soilPhMin: z.number().finite().min(0).max(14).optional(),
  soilPhMax: z.number().finite().min(0).max(14).optional(),
  minimumTemperatureC: z.number().finite().min(-100).max(100).optional(),
  notes: optionalText(20000), purchasePrice: z.number().finite().min(0).max(1000000).optional()
};
function validatePlant(p: {id:string; motherId?:string; fatherId?:string; soilPhMin?:number;soilPhMax?:number}, ctx:z.RefinementCtx) {
  if (p.motherId === p.id || p.fatherId === p.id) ctx.addIssue({code:'custom',message:'Autogenitorialità vietata'});
  if (p.soilPhMin !== undefined && p.soilPhMax !== undefined && p.soilPhMin > p.soilPhMax) {
    ctx.addIssue({code:'custom',message:'Intervallo pH invertito'});
  }
}
export const plantDraftSchema = z.strictObject(plantFields).superRefine(validatePlant);
export const plantSchema = z.strictObject({...plantFields, createdAt:timestamp, updatedAt:timestamp}).superRefine(validatePlant);
const placeFields = {
  id:ENTITY_ID, name, kind:z.enum(['balcony','garden','indoor','greenhouse','other']),
  latitude:z.number().finite().min(-90).max(90).optional(),
  longitude:z.number().finite().min(-180).max(180).optional(),
  notes:optionalText(10000)
};
function validatePlace(p:{latitude?:number;longitude?:number},ctx:z.RefinementCtx) {
  if ((p.latitude===undefined)!==(p.longitude===undefined)) ctx.addIssue({code:'custom',message:'Coordinate incomplete'});
}
export const placeDraftSchema=z.strictObject(placeFields).superRefine(validatePlace);
export const placeSchema=z.strictObject({...placeFields,createdAt:timestamp,updatedAt:timestamp}).superRefine(validatePlace);
const eventFields = {
  id:ENTITY_ID, plantId:ENTITY_ID, date:calendarDate,
  type:z.enum(['observation','care','measurement','flowering','fruiting','harvest']),
  note:optionalText(10000),
  heightCm:z.number().finite().min(0).max(100000).optional(),
  soilPh:z.number().finite().min(0).max(14).optional(),
  harvestGrams:z.number().finite().min(0).max(100000000).optional()
};
function validateEvent(e:{type:string;heightCm?:number;soilPh?:number;harvestGrams?:number},ctx:z.RefinementCtx) {
  if ((e.heightCm!==undefined||e.soilPh!==undefined)&&e.type!=='measurement') ctx.addIssue({code:'custom',message:'Misurazione con tipo scorretto'});
  if (e.harvestGrams!==undefined&&e.type!=='harvest') ctx.addIssue({code:'custom',message:'Raccolto con tipo scorretto'});
}
export const eventDraftSchema=z.strictObject(eventFields).superRefine(validateEvent);
export const eventSchema=z.strictObject({...eventFields,createdAt:timestamp}).superRefine(validateEvent);
const patchPlant = {
  commonName:name.optional(),scientificName:z.string().trim().max(160).nullable().optional(),
  cultivar:z.string().trim().max(120).nullable().optional(),origin:plantFields.origin.optional(),
  status:plantFields.status.optional(),sownOn:calendarDate.nullable().optional(),
  acquiredOn:calendarDate.nullable().optional(),motherId:ENTITY_ID.nullable().optional(),
  fatherId:ENTITY_ID.nullable().optional(),placeId:ENTITY_ID.nullable().optional(),
  potLiters:plantFields.potLiters.unwrap().nullable().optional(),
  soilPhMin:plantFields.soilPhMin.unwrap().nullable().optional(),
  soilPhMax:plantFields.soilPhMax.unwrap().nullable().optional(),
  minimumTemperatureC:plantFields.minimumTemperatureC.unwrap().nullable().optional(),
  notes:z.string().trim().max(20000).nullable().optional(),
  purchasePrice:plantFields.purchasePrice.unwrap().nullable().optional()
};
const patchPlace = {
  name:name.optional(),kind:placeFields.kind.optional(),
  latitude:placeFields.latitude.unwrap().nullable().optional(),
  longitude:placeFields.longitude.unwrap().nullable().optional(),
  notes:z.string().trim().max(10000).nullable().optional()
};
export const domainOperationSchema=z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('plant.create'),plant:plantDraftSchema}),
  z.strictObject({type:z.literal('plant.patch'),id:ENTITY_ID,patch:z.strictObject(patchPlant)}),
  z.strictObject({type:z.literal('place.create'),place:placeDraftSchema}),
  z.strictObject({type:z.literal('place.patch'),id:ENTITY_ID,patch:z.strictObject(patchPlace)}),
  z.strictObject({type:z.literal('event.add'),event:eventDraftSchema})
]);
export type Plant=z.infer<typeof plantSchema>;
export type Place=z.infer<typeof placeSchema>;
export type PlantEvent=z.infer<typeof eventSchema>;
export type DomainOperation=z.infer<typeof domainOperationSchema>;
export const gardenStateSchema=z.strictObject({
  plants:z.record(ENTITY_ID,plantSchema),
  places:z.record(ENTITY_ID,placeSchema),
  events:z.record(ENTITY_ID,eventSchema)
}).superRefine((state,ctx)=>{
  for(const [id,p] of Object.entries(state.plants)){
    if(id!==p.id)ctx.addIssue({code:'custom',message:'ID pianta non corrispondente'});
    if(p.placeId&&!state.places[p.placeId])ctx.addIssue({code:'custom',message:'Luogo inesistente'});
    for(const parent of [p.motherId,p.fatherId])if(parent&&!state.plants[parent])ctx.addIssue({code:'custom',message:'Genitore inesistente'});
  }
  for(const [id,p] of Object.entries(state.places))if(id!==p.id)ctx.addIssue({code:'custom',message:'ID luogo non corrispondente'});
  for(const [id,e] of Object.entries(state.events))if(id!==e.id||!state.plants[e.plantId])ctx.addIssue({code:'custom',message:'Evento orfano'});
  const seen=new Set<string>(), path=new Set<string>();
  function visit(id:string):boolean{
    if(path.has(id))return true;
    if(seen.has(id)||!state.plants[id])return false;
    path.add(id);
    for(const parent of [state.plants[id].motherId,state.plants[id].fatherId])if(parent&&visit(parent))return true;
    path.delete(id); seen.add(id);return false;
  }
  for(const id of Object.keys(state.plants))if(visit(id)){ctx.addIssue({code:'custom',message:'Genealogia ciclica'});break;}
});
export type GardenState=z.infer<typeof gardenStateSchema>;
export function emptyGarden():GardenState{return{plants:{},places:{},events:{}};}
