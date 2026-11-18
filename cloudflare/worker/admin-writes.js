// Trusted owner-only writes; Kinde subject verification occurs in the Worker router.
const ID = /^[A-Za-z0-9_-]{1,96}$/;
const ROOT = "/api/v1/admin/";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAXON = { name:120, scientific_name:180, category:120,
  description:3000, growth_habit:300, light:300, water:300,
  pollination:1000, cold_notes:2000, cold_source_url:2048 };
const PLANT = { display_label:180, life_stage:80, propagation_method:120,
  source_details:1500, private_location:500, internal_notes:10000,
  image_url:2048, sown_on:10 };
const CULTIVAR = { name:120, fruit_notes:3000, cold_notes:2000,
  cold_source_url:2048, pollination:1000 };
class Invalid extends Error {}
class Conflict extends Error {}
class NotFound extends Error {}
function respond(data,status=200) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store, max-age=0",
    "X-Content-Type-Options":"nosniff"}});
}
function checkKeys(data,allowed,required=[]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Invalid();
  if (Object.keys(data).some(key=>!allowed.includes(key))) throw new Invalid();
  if (required.some(key=>!Object.hasOwn(data,key))) throw new Invalid();
}
function ident(value) {
  if(typeof value!=="string" || !ID.test(value)) throw new Invalid();
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value<1) throw new Invalid();
  return value;
}
function text(value,max,required=false) {
  if(value===null&&!required)return null;
  if(typeof value!=="string"||value.length>max||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Invalid();
  const v=value.trim();
  if(required&&!v)throw new Invalid();
  return v||null;
}
function uri(value) {
  if(value===null||value==="")return null;
  const raw=text(value,2048);
  try {
    const u=new URL(raw);
    if(u.protocol!=="https:"||u.username||u.password)throw new Invalid();
    return u.href;
  } catch {throw new Invalid();}
}
function parseDate(value) {
  if(value===null||value==="")return null;
  if(typeof value!=="string"||! /^\d{4}-\d{2}-\d{2}$/.test(value)||
      !Number.isFinite(Date.parse(value+"T00:00:00Z")) ||
      new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw new Invalid();
  return value;
}
function normalized(key,value,group) {
  if(key==="kind") {
    if(!["unverified","species","hybrid"].includes(value))throw new Invalid();
    return value;
  }
  if(key==="cold_min_c") {
    if(value===null)return null;
    if(typeof value!=="number"||!Number.isFinite(value)||value< -90||value>70)throw new Invalid();
    return value;
  }
  if(["taxon_id","cultivar_id","seed_lot_id"].includes(key))
    return value===null&&key!=="taxon_id"?null:ident(value);
  if(key==="sown_on")return parseDate(value);
  if(key.endsWith("_url")||key==="image_url")return uri(value);
  return text(value,group[key],key==="name");
}
function fields(source,group,extras=[]) {
  const allowed=[...Object.keys(group),...extras];
  checkKeys(source,allowed);
  return Object.fromEntries(Object.entries(source).map(([k,v])=>[k,normalized(k,v,group)]));
}
const nameKey=name=>name.normalize("NFKC").toLocaleLowerCase("it");
async function parseBody(request) {
  if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("Content-Type")||""))throw new Invalid();
  if(!request.body)throw new Invalid();
  const reader=request.body.getReader();
  let total=0;
  const chunks=[];
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>16384){await reader.cancel();throw new Invalid();}
      chunks.push(value);
    }
    if(total===0)throw new Invalid();
    const result=new Uint8Array(total);
    let offset=0;
    for(const bytes of chunks){result.set(bytes,offset);offset+=bytes.length;}
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(result));
  }catch{throw new Invalid();}
  finally{reader.releaseLock();}
}
function safeError(err){
  if(err instanceof Invalid)return respond({error:{code:"invalid_request"}},400);
  if(err instanceof Conflict)return respond({error:{code:"conflict"}},409);
  if(err instanceof NotFound)return respond({error:{code:"not_found"}},404);
  if(/\b(?:UNIQUE|FOREIGN KEY|CHECK) constraint failed\b/i.test(String(err?.message)))
    return respond({error:{code:"conflict"}},409);
  return respond({error:{code:"service_unavailable"}},503);
}
async function changed(db,sql,args) {
  const r=await db.prepare(sql).bind(...args).run();
  if(r?.success!==true||!Number.isSafeInteger(r.meta?.changes))throw Error("D1 error");
  return r.meta.changes;
}
async function versionAfterMiss(db,table,key,expected) {
  const current=await db.prepare("SELECT version FROM "+table+" WHERE id=? LIMIT 1").bind(key).first();
  if(!current)throw new NotFound();
  if(current.version!==expected)throw new Conflict();
  throw Error("D1 unexpected write count");
}
const selectorFields={taxa:TAXON,cultivars:CULTIVAR,specimens:PLANT};
async function addTaxon(db,data,now) {
  checkKeys(data,["kind","cold_min_c",...Object.keys(TAXON)],["name"]);
  const v=fields(data,TAXON,["kind","cold_min_c"]);
  const keys=Object.keys(TAXON).filter(k=>k!=="name");
  const id=crypto.randomUUID();
  const values=[id,v.kind??"unverified",v.name,nameKey(v.name),v.cold_min_c??null,
    ...keys.map(k=>v[k]??null),now,now];
  const cols=["id","kind","name","name_key","cold_min_c",...keys,"created_at","updated_at"];
  const sql="INSERT INTO taxa ("+cols.join(",")+") VALUES ("+cols.map(()=>"?").join(",")+")";
  if(await changed(db,sql,values)!==1)throw Error("unexpected insert");
  return respond({id,version:1},201);
}
async function addCultivar(db,data,now) {
  checkKeys(data,["taxon_id","cold_min_c",...Object.keys(CULTIVAR)],["taxon_id","name"]);
  const v=fields(data,CULTIVAR,["taxon_id","cold_min_c"]);
  const id=crypto.randomUUID();
  const keys=Object.keys(CULTIVAR).filter(k=>k!=="name");
  const cols=["id","taxon_id","name","name_key","cold_min_c",...keys,"created_at","updated_at"];
  const vals=[id,v.taxon_id,v.name,nameKey(v.name),v.cold_min_c??null,
    ...keys.map(k=>v[k]??null),now,now];
  if(await changed(db,"INSERT INTO cultivars ("+cols.join(",")+") VALUES ("+
    cols.map(()=>"?").join(",")+")",vals)!==1)throw Error("Unexpected insert");
  return respond({id,version:1},201);
}
async function addPlant(db,data,now) {
  checkKeys(data,["taxon_id","cultivar_id","seed_lot_id",...Object.keys(PLANT)],["taxon_id"]);
  const v=fields(data,PLANT,["taxon_id","cultivar_id","seed_lot_id"]);
  const id=crypto.randomUUID();
  const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),
    byte=>CODE_ALPHABET[byte%CODE_ALPHABET.length]).join("");
  const keys=Object.keys(PLANT);
  const cols=["id","taxon_id","cultivar_id","seed_lot_id","code",...keys,"created_at","updated_at"];
  const vals=[id,v.taxon_id,v.cultivar_id??null,v.seed_lot_id??null,code,
    ...keys.map(k=>v[k]??null),now,now];
  const insert="INSERT INTO specimens ("+cols.join(",")+") VALUES ("+
    cols.map(()=>"?").join(",")+")";
  const results=await db.batch([
    db.prepare("INSERT INTO specimen_code_reservations (code,specimen_id,reserved_at) VALUES (?,?,?)")
      .bind(code,id,now),
    db.prepare(insert).bind(...vals)
  ]);
  if(!Array.isArray(results)||results.length!==2||results.some(r=>r.success!==true||r.meta?.changes!==1))
    throw Error("Unexpected transaction");
  return respond({id,code,version:1},201);
}
async function patch(db,table,id,data,now) {
  const extra=table==="taxa"?["kind","cold_min_c"]:
    table==="cultivars"?["cold_min_c"]:["taxon_id","cultivar_id","seed_lot_id"];
  checkKeys(data,["version",...Object.keys(selectorFields[table]),...extra],["version"]);
  const expected=version(data.version);
  const copy=Object.fromEntries(Object.entries(data).filter(([k])=>k!=="version"));
  if(!Object.keys(copy).length)throw new Invalid();
  const v=fields(copy,selectorFields[table],extra);
  if(Object.hasOwn(v,"name"))v.name_key=nameKey(v.name);
  const pairs=Object.entries(v);
  const sql="UPDATE "+table+" SET "+pairs.map(([key])=>key+"=?").join(",")+
    ",updated_at=?,version=version+1 WHERE id=? AND version=?";
  const rows=await changed(db,sql,[...pairs.map(([,val])=>val),now,id,expected]);
  if(rows!==1)await versionAfterMiss(db,table,id,expected);
  return respond({id,version:expected+1});
}
async function publish(db,method,id,data,now) {
  checkKeys(data,method==="PUT"?["version","summary","photo_url"]:["version"],["version"]);
  const expected=version(data.version);
  let rows;
  if(method==="PUT"){
    const summary=text(data.summary??null,2500),photo=uri(data.photo_url??null);
    rows=await changed(db,
      "INSERT INTO public_listings(specimen_id,summary,photo_url,published_at,updated_at) "+
      "SELECT id,?,?,?,? FROM specimens WHERE id=? AND version=? "+
      "ON CONFLICT(specimen_id) DO UPDATE SET summary=excluded.summary,"+
      "photo_url=excluded.photo_url,updated_at=excluded.updated_at "+
      "WHERE EXISTS (SELECT 1 FROM specimens WHERE id=excluded.specimen_id AND version=?)",
      [summary,photo,now,now,id,expected,expected]);
  } else {
    rows=await changed(db,
      "DELETE FROM public_listings WHERE specimen_id=? AND "+
      "EXISTS (SELECT 1 FROM specimens WHERE id=? AND version=?)",
      [id,id,expected]);
  }
  if(rows!==1)await versionAfterMiss(db,"specimens",id,expected);
  return respond({id,published:method==="PUT",version:expected+1});
}
async function cultivars(db,search){
  const keys=[...search.keys()];
  if(keys.length>1||(keys.length===1&&keys[0]!=="taxon_id"))throw new Invalid();
  const filter=search.has("taxon_id")?ident(search.get("taxon_id")):null;
  const sql="SELECT id,taxon_id,name,fruit_notes,version FROM cultivars "+
    (filter?"WHERE taxon_id=? ":"")+"ORDER BY name COLLATE NOCASE,id LIMIT 201";
  const result=await db.prepare(sql).bind(...(filter?[filter]:[])).all();
  if(result?.success!==true||!Array.isArray(result.results)||result.results.length>200)
    throw Error("Unexpected result");
  return respond({items:result.results});
}
export async function adminMutation(request,db,url,now=new Date().toISOString()){
  const path=url.pathname;
  if(!path.startsWith(ROOT))return null;
  const parts=path.slice(ROOT.length).split("/");
  const table=parts[0],entry=parts[1],kind=parts[2];
  if(!["taxa","cultivars","specimens"].includes(table)||parts.length>3||
      (parts.length===3&&(table!=="specimens"||kind!=="publication"))||
      (entry!==undefined&&!ID.test(entry)))return null;
  if(request.method==="GET"&&table==="cultivars"&&parts.length===1){
    try{return await cultivars(db,url.searchParams);}catch(e){return safeError(e);}
  }
  if(request.method==="GET")return null;
  const method=request.method;
  const valid=(method==="POST"&&parts.length===1)||
    (method==="PATCH"&&parts.length===2)||
    ((method==="PUT"||method==="DELETE")&&parts.length===3);
  if(!valid)return null;
  if(url.search||request.headers.get("Origin")!==url.origin||
    ![null,"same-origin"].includes(request.headers.get("Sec-Fetch-Site")))
    return respond({error:{code:"forbidden"}},403);
  try {
    const data=await parseBody(request);
    if(method==="POST"){
      if(table==="taxa")return await addTaxon(db,data,now);
      if(table==="cultivars")return await addCultivar(db,data,now);
      return await addPlant(db,data,now);
    }
    if(method==="PATCH")return await patch(db,table,ident(entry),data,now);
    return await publish(db,method,ident(entry),data,now);
  } catch(e){return safeError(e);}
}
