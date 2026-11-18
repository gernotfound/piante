// Seed lots and append-only journal. Router authenticates one Kinde owner before entry.
import { Invalid, Conflict, NotFound, respond, checkKeys, ident, version, text,
  parseDate, parseBody, safeError, changed, versionAfterMiss } from "./admin-writes.js";

const LOT_LIST="/api/v1/admin/seed-lots";
const JOURNAL=/^\/api\/v1\/admin\/specimens\/([A-Za-z0-9_-]{1,96})\/journal$/;
const LOT_DETAIL=/^\/api\/v1\/admin\/seed-lots\/([A-Za-z0-9_-]{1,96})$/;
const B64=/^[A-Za-z0-9_-]{1,512}$/;
const MAX_PAGE=40;
function encodeCursor(row,key) {
  return btoa(JSON.stringify([row[key],row.id])).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
}
function decodeCursor(value,maxStamp=40) {
  if(!B64.test(value)) throw new Invalid();
  try {
    const v=JSON.parse(atob(value.replaceAll("-","+").replaceAll("_","/")));
    if(!Array.isArray(v)||v.length!==2||typeof v[0]!=="string"||
      v[0].length>maxStamp||!v[0]||typeof v[1]!=="string")throw new Invalid();
    return [v[0],ident(v[1])];
  } catch{throw new Invalid();}
}
function parsePage(params, extra) {
  const allowed=["limit","cursor",...extra];
  for(const key of params.keys())
    if(!allowed.includes(key)||params.getAll(key).length!==1)throw new Invalid();
  const raw=params.get("limit");
  const limit=raw===null?20:Number(raw);
  if(raw!==null&&!/^[1-9][0-9]?$/.test(raw)||
      !Number.isSafeInteger(limit)||limit<1||limit>MAX_PAGE)throw new Invalid();
  const token=params.get("cursor");
  return {limit,cursor:token===null?null:decodeCursor(token)};
}
async function listLots(db,params) {
  const {limit,cursor}=parsePage(params,["taxon_id"]);
  const taxon=params.get("taxon_id");
  const where=[];
  const bind=[];
  if(taxon!==null) {where.push("taxon_id=?");bind.push(ident(taxon));}
  if(cursor) {where.push("(updated_at<? OR (updated_at=? AND id<?))");bind.push(cursor[0],cursor[0],cursor[1]);}
  const sql="SELECT id,taxon_id,label,source_details,source_cultivar_label,private_notes,sown_on,created_at,updated_at,version FROM seed_lots "+
    (where.length?"WHERE "+where.join(" AND ")+" ":"")+"ORDER BY updated_at DESC,id DESC LIMIT ?";
  const result=await db.prepare(sql).bind(...bind,limit+1).all();
  if(result?.success!==true||!Array.isArray(result.results))throw Error("D1 list error");
  const items=result.results.slice(0,limit);
  return respond({items,nextCursor:result.results.length>limit?encodeCursor(items[items.length-1],"updated_at"):null});
}
async function detailLot(db,id) {
  const result=await db.prepare("SELECT id,taxon_id,label,source_details,source_cultivar_label,private_notes,sown_on,created_at,updated_at,version FROM seed_lots WHERE id=? LIMIT 1").bind(id).first();
  if(!result)throw new NotFound();
  return respond(result);
}
const LOT_FIELDS={label:120,source_details:2000,source_cultivar_label:200,
  private_notes:10000,sown_on:10};
function lotValues(data) {
  const entries={};
  for(const [key,value] of Object.entries(data)){
    if(key==="sown_on")entries[key]=parseDate(value);
    else entries[key]=text(value,LOT_FIELDS[key],key==="label");
  }
  return entries;
}
async function createLot(db,data,now) {
  checkKeys(data,["taxon_id",...Object.keys(LOT_FIELDS)],["taxon_id","label"]);
  const taxon=ident(data.taxon_id), vals=lotValues(Object.fromEntries(
    Object.entries(data).filter(([k])=>k!=="taxon_id")));
  const id=crypto.randomUUID();
  const keys=Object.keys(LOT_FIELDS);
  const cols=["id","taxon_id",...keys,"created_at","updated_at"];
  const res=await changed(db,"INSERT INTO seed_lots ("+cols.join(",")+") VALUES ("+
    cols.map(()=>"?").join(",")+")",[id,taxon,...keys.map(k=>vals[k]??null),now,now]);
  if(res!==1)throw Error("D1 insert");
  return respond({id,version:1},201);
}
async function editLot(db,id,data,now) {
  checkKeys(data,["version",...Object.keys(LOT_FIELDS)],["version"]);
  const ver=version(data.version);
  const edits=Object.fromEntries(Object.entries(data).filter(([k])=>k!=="version"));
  if(!Object.keys(edits).length)throw new Invalid();
  const fields=lotValues(edits),keys=Object.keys(fields);
  const res=await changed(db,"UPDATE seed_lots SET "+
    keys.map(k=>k+"=?").join(",")+",updated_at=?,version=version+1 WHERE id=? AND version=?",
    [...keys.map(k=>fields[k]),now,id,ver]);
  if(res!==1)await versionAfterMiss(db,"seed_lots",id,ver);
  return respond({id,version:ver+1});
}
async function listJournal(db,specimen,params) {
  const {limit,cursor}=parsePage(params,[]);
  const bind=[specimen],where=["specimen_id=?"];
  if(cursor){where.push("(event_on<? OR (event_on=? AND id<?))");bind.push(cursor[0],cursor[0],cursor[1]);}
  const result=await db.prepare("SELECT id,specimen_id,origin,kind,note,event_on,created_at FROM journal_entries WHERE "+
    where.join(" AND ")+" ORDER BY event_on DESC,id DESC LIMIT ?").bind(...bind,limit+1).all();
  if(result?.success!==true||!Array.isArray(result.results))throw Error("D1 journal failure");
  const items=result.results.slice(0,limit);
  return respond({items,nextCursor:result.results.length>limit?encodeCursor(items[items.length-1],"event_on"):null});
}
async function addEntry(db,specimen,data,now) {
  checkKeys(data,["kind","note","event_on"],["kind","event_on"]);
  const kind=text(data.kind,100,true);
  const eventOn=parseDate(data.event_on);
  if(!eventOn)throw new Invalid();
  const note=data.note===undefined?null:text(data.note,10000);
  const id=crypto.randomUUID();
  const res=await changed(db,"INSERT INTO journal_entries (id,specimen_id,origin,kind,note,event_on,created_at) VALUES (?,?,'manual',?,?,?,?)",
    [id,specimen,kind,note,eventOn,now]);
  if(res!==1)throw Error("D1 journal insert");
  return respond({id,specimen_id:specimen,origin:"manual",kind,event_on:eventOn},201);
}
export async function adminCultivation(request,db,url,now=new Date().toISOString()) {
  const lot=url.pathname===LOT_LIST;
  const lotId=url.pathname.match(LOT_DETAIL)?.[1];
  const journalId=url.pathname.match(JOURNAL)?.[1];
  if(!lot&&!lotId&&!journalId)return null;
  const method=request.method;
  const isRead=method==="GET";
  const isCreate=method==="POST"&&(lot||journalId);
  const isPatch=method==="PATCH"&&!!lotId;
  if(!isRead&&!isCreate&&!isPatch)return respond({error:{code:"method_not_allowed"}},405);
  if(!isRead&&(url.search||request.headers.get("Origin")!==url.origin||
      ![null,"same-origin"].includes(request.headers.get("Sec-Fetch-Site"))))
    return respond({error:{code:"forbidden"}},403);
  try {
    if(isRead) {
      if(lot)return await listLots(db,url.searchParams);
      if(lotId) {
        if(url.search)return respond({error:{code:"invalid_request"}},400);
        return await detailLot(db,lotId);
      }
      return await listJournal(db,journalId,url.searchParams);
    }
    const body=await parseBody(request);
    if(isCreate){
      if(lot)return await createLot(db,body,now);
      return await addEntry(db,journalId,body,now);
    }
    return await editLot(db,lotId,body,now);
  } catch(e){return safeError(e);}
}
