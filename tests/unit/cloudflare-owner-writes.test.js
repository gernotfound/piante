import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../../cloudflare/worker/index.js";

const v1=readFileSync(new URL("../../cloudflare/migrations/0001_initial.sql",import.meta.url),"utf8");
const v2=readFileSync(new URL("../../cloudflare/migrations/0002_publication_version.sql",import.meta.url),"utf8");
const ORIGIN="https://piantee.example.test";
const OWNER="kp_owner_test_12345678";
function database(){
  const sql=new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON;");
  sql.exec(v1+"\n"+v2);
  const d1={
    prepare(text){
      const stm=sql.prepare(text);
      return {
        bind(...args){
          return {
            async first(){return stm.get(...args)??null;},
            async all(){return {success:true,results:stm.all(...args)};},
            async run(){const info=stm.run(...args);return {success:true,meta:{changes:info.changes}};}
          };
        }
      };
    },
    async batch(statements){
      sql.exec("BEGIN");
      try{
        const result=[];
        for(const stm of statements)result.push(await stm.run());
        sql.exec("COMMIT");
        return result;
      }catch(e){sql.exec("ROLLBACK");throw e;}
    }
  };
  return {sql,d1,close(){sql.close();}};
}
async function fixture(t){
  const db=database();
  t.after(()=>db.close());
  const env={DB:db.d1,KINDE_ISSUER:"https://piantee-unique.kinde.com",
    KINDE_SITE_ORIGIN:ORIGIN,KINDE_CLIENT_ID:"piantee-unique-app",
    KINDE_CLIENT_SECRET:"synthetic-only-secret",KINDE_OWNER_SUB:OWNER,
    KINDE_SESSION_KEY:Buffer.alloc(32,7).toString("base64url")};
  const now=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({purpose:"session",sub:OWNER,iat:now-2,exp:now+600})).toString("base64url");
  const key=await crypto.subtle.importKey("raw",Buffer.alloc(32,7),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));
  const cookie="__Host-piantee_session="+payload+"."+Buffer.from(mac).toString("base64url");
  async function call(method,path,data,extra={},validSession=true){
    const headers={Origin:ORIGIN,"Content-Type":"application/json",
      ...(validSession?{Cookie:cookie}:{}),...extra};
    const res=await worker.fetch(new Request(ORIGIN+path,{method,headers,
      ...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
    return {status:res.status,body:await res.json()};
  }
  return {...db,call,cookie,env};
}
test("owner Kinde crea specie ed esemplare, con codice immutabile e catalogo segregato",async t=>{
  const f=await fixture(t);
  const noSession=await f.call("POST","/api/v1/admin/taxa",{name:"Avocado"}, {}, false);
  assert.equal(noSession.status,403);
  const newTaxon=await f.call("POST","/api/v1/admin/taxa",{name:"Avocado",category:"Fruttifere"});
  assert.equal(newTaxon.status,201);
  const taxonId=newTaxon.body.id;
  assert.equal(f.sql.prepare("SELECT kind FROM taxa WHERE id=?").get(taxonId).kind,"unverified");
  const plant=await f.call("POST","/api/v1/admin/specimens",{
    taxon_id:taxonId,display_label:"Avocado da seme",internal_notes:"RISERVATISSIMO"});
  assert.equal(plant.status,201);
  assert.match(plant.body.code,/^[A-Z0-9]{6}$/);
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM specimen_code_reservations").get().n,1);
  assert.equal((await f.call("GET","/api/v1/catalog")).body.items.length,0);
  const published=await f.call("PUT","/api/v1/admin/specimens/"+plant.body.id+"/publication",
    {version:1,summary:"Avocado coltivato",photo_url:null});
  assert.equal(published.status,200);
  assert.equal(published.body.version,2);
  const listed=await f.call("GET","/api/v1/catalog");
  assert.equal(listed.body.items.length,1);
  assert.equal(JSON.stringify(listed.body).includes("RISERVATISSIMO"),false);
  const edit=await f.call("PATCH","/api/v1/admin/taxa/"+taxonId,
    {version:1,name:"Avocado aggiornata"});
  assert.equal(edit.status,200);
  assert.equal((await f.call("GET","/api/v1/catalog")).body.items[0].taxon_name,"Avocado aggiornata");
  const stale=await f.call("PATCH","/api/v1/admin/specimens/"+plant.body.id,
    {version:1,internal_notes:"non sovrascrivere"});
  assert.equal(stale.status,409);
  assert.equal(f.sql.prepare("SELECT internal_notes FROM specimens WHERE id=?").get(plant.body.id).internal_notes,
    "RISERVATISSIMO");
  const removed=await f.call("DELETE","/api/v1/admin/specimens/"+plant.body.id+"/publication",{version:2});
  assert.equal(removed.status,200);
  assert.equal((await f.call("GET","/api/v1/catalog")).body.items.length,0);
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM specimen_code_reservations").get().n,1);
});
test("valida input, origini, conflitti, associazioni cultivar e atomicità della prenotazione",async t=>{
  const f=await fixture(t);
  const p="/api/v1/admin/";
  const species=await f.call("POST",p+"taxa",{name:"Passiflora"});
  const other=await f.call("POST",p+"taxa",{name:"Altra pianta"});
  assert.equal(species.status,201);
  assert.equal(other.status,201);
  assert.equal((await f.call("POST",p+"taxa",{name:"Passiflora"})).status,409);
  assert.equal((await f.call("POST",p+"taxa",{name:" ",kind:"species"})).status,400);
  assert.equal((await f.call("POST",p+"taxa",{name:"Valid",unexpected:true})).status,400);
  const variety=await f.call("POST",p+"cultivars",{taxon_id:species.body.id,name:"Edulis"});
  assert.equal(variety.status,201);
  const found=await f.call("GET",p+"cultivars?taxon_id="+species.body.id);
  assert.equal(found.body.items.length,1);
  assert.equal((await f.call("POST",p+"specimens",{taxon_id:other.body.id,
    cultivar_id:variety.body.id})).status,409);
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM specimen_code_reservations").get().n,0,
    "Failed batch must roll back reservation");
  assert.equal((await f.call("POST",p+"specimens",{taxon_id:species.body.id,
    cultivar_id:variety.body.id,sown_on:"2026-02-31"})).status,400);
  assert.equal((await f.call("POST",p+"specimens",{taxon_id:species.body.id},
    {Origin:"https://malicious.invalid"})).status,403);
  assert.equal((await f.call("POST",p+"specimens",{taxon_id:species.body.id},
    {"Sec-Fetch-Site":"cross-site"})).status,403);
  const plant=await f.call("POST",p+"specimens",{taxon_id:species.body.id,cultivar_id:variety.body.id});
  assert.equal(plant.status,201);
  assert.equal((await f.call("PATCH",p+"specimens/"+plant.body.id,
    {version:1,private_location:"Balcone"})).status,200);
  assert.equal((await f.call("PATCH",p+"specimens/"+plant.body.id,
    {version:1,private_location:"Terreno"})).status,409);
  assert.equal((await f.call("PUT",p+"specimens/"+plant.body.id+"/publication",
    {version:1,summary:"vecchio"})).status,409);
  assert.equal((await f.call("PUT",p+"specimens/"+plant.body.id+"/publication",
    {version:2,photo_url:"http://unsafe.invalid"})).status,400);
  assert.equal((await f.call("PATCH",p+"taxa/"+species.body.id,
    {version:1,cold_min_c:-100})).status,400);
  assert.equal((await f.call("POST",p+"taxa",{name:"CSRF"},
    {Origin:ORIGIN,Cookie:"__Host-piantee_session=forged"})).status,403);
});


test("lotti: creazione e modifica CAS, specie corretta, dati privati e associazione",async t=>{
  const f=await fixture(t),base="/api/v1/admin/";
  const taxon=await f.call("POST",base+"taxa",{name:"Passiflora"});
  const another=await f.call("POST",base+"taxa",{name:"Avocado"});
  const invalid=await f.call("POST",base+"seed-lots",{
    taxon_id:another.body.id,label:"Lotto",sown_on:"2026-02-30"});
  assert.equal(invalid.status,400);
  const lot=await f.call("POST",base+"seed-lots",{taxon_id:taxon.body.id,
    label:"Semi da frutto",source_details:"Acquistati",source_cultivar_label:"Frutto Edulis",
    private_notes:"PRIVATO",sown_on:"2026-11-17"});
  assert.equal(lot.status,201);
  const list=await f.call("GET",base+"seed-lots?taxon_id="+taxon.body.id);
  assert.equal(list.status,200);
  assert.equal(list.body.items.length,1);
  assert.equal(list.body.items[0].private_notes,"PRIVATO");
  assert.equal((await f.call("GET",base+"seed-lots?taxon_id="+another.body.id)).body.items.length,0);
  const detail=await f.call("GET",base+"seed-lots/"+lot.body.id);
  assert.equal(detail.body.source_cultivar_label,"Frutto Edulis");
  assert.equal((await f.call("GET",base+"seed-lots/"+lot.body.id+"?bad=1")).status,400);
  const updated=await f.call("PATCH",base+"seed-lots/"+lot.body.id,{
    version:1,label:"Semina lotto B",private_notes:"RISERVATO"});
  assert.equal(updated.status,200);
  assert.equal(updated.body.version,2);
  const stale=await f.call("PATCH",base+"seed-lots/"+lot.body.id,{version:1,label:"vecchia"});
  assert.equal(stale.status,409);
  assert.equal(f.sql.prepare("SELECT label FROM seed_lots WHERE id=?").get(lot.body.id).label,"Semina lotto B");
  const invalidLink=await f.call("POST",base+"specimens",{
    taxon_id:another.body.id,seed_lot_id:lot.body.id});
  assert.equal(invalidLink.status,409);
  const valid=await f.call("POST",base+"specimens",{
    taxon_id:taxon.body.id,seed_lot_id:lot.body.id});
  assert.equal(valid.status,201);
  assert.equal((await f.call("GET","/api/v1/catalog")).body.items.length,0);
  assert.equal((await f.call("POST",base+"seed-lots",{taxon_id:taxon.body.id,label:"X"},{},false)).status,403);
});
test("diario: inserimento manuale append-only, lettura privata, vincolo esemplare",async t=>{
  const f=await fixture(t),base="/api/v1/admin/";
  const taxon=await f.call("POST",base+"taxa",{name:"Tamarillo"});
  const plant=await f.call("POST",base+"specimens",{taxon_id:taxon.body.id});
  const url=base+"specimens/"+plant.body.id+"/journal";
  assert.equal((await f.call("POST",url,{kind:"Annaffiatura",event_on:"2026-12-31"} ,{},false)).status,403);
  assert.equal((await f.call("POST",url,{kind:"Annaffiatura",event_on:"2026-02-31"})).status,400);
  assert.equal((await f.call("POST",url,{kind:"",event_on:"2026-11-18"})).status,400);
  assert.equal((await f.call("POST",url,{kind:"Note",event_on:"2026-11-18",origin:"automatic"})).status,400);
  const first=await f.call("POST",url,{
    kind:"Concimazione",note:"Fertilizzante a dose ridotta",event_on:"2026-11-17"});
  assert.equal(first.status,201);
  const second=await f.call("POST",url,{kind:"Irrigazione",event_on:"2026-11-18"});
  assert.equal(second.status,201);
  const page=await f.call("GET",url+"?limit=1");
  assert.equal(page.status,200);
  assert.equal(page.body.items[0].kind,"Irrigazione");
  assert.ok(page.body.nextCursor);
  const next=await f.call("GET",url+"?limit=1&cursor="+encodeURIComponent(page.body.nextCursor));
  assert.equal(next.status,200);
  assert.equal(next.body.items[0].kind,"Concimazione");
  assert.equal(next.body.items[0].origin,"manual");
  assert.equal((await f.call("GET",url+"?cursor=bad")).status,400);
  assert.equal((await f.call("DELETE",url,{version:1})).status,405);
  assert.equal((await f.call("POST",base+"specimens/not-found/journal",{
    kind:"Nota",event_on:"2026-11-18"})).status,409);
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM journal_entries").get().n,2);
  assert.equal((await f.call("GET","/api/v1/catalog")).body.items.length,0);
  assert.throws(()=>f.sql.prepare("DELETE FROM journal_entries").run(),/append-only/);
});
