import test from "node:test";
import assert from "node:assert/strict";
import { checkPhotoInput, compressPhoto, MAX_STORED_PHOTO_BYTES } from "../web/scripts/photo.mjs";

const file=(type="image/jpeg",size=120000)=>({type,size});
test("solo formati immagine decodificabili; blocco input troppo grandi",()=>{
  for(const type of ["image/jpeg","image/png","image/webp","image/avif"])
    assert.doesNotThrow(()=>checkPhotoInput(file(type)));
  for(const type of ["image/svg+xml","text/html","application/pdf"])
    assert.throws(()=>checkPhotoInput(file(type)),/JPEG/);
  assert.throws(()=>checkPhotoInput(file("image/png",31*1024*1024)),/30 MB/);
});
test("foto ottimizzata iterativamente e sotto limite Firestore",async()=>{
  const sizes=[300000,181000,98000];
  const canvases=[];
  const canvas={
    width:0,height:0,
    getContext:()=>({drawImage:()=>{}}),
    toBlob:(callback,type)=>callback(new Blob([new Uint8Array(sizes.shift())],{type}))
  };
  const img={width:3024,height:4032,close(){}};
  const result=await compressPhoto(file(),{decode:async()=>img,makeCanvas:()=>canvas});
  assert.equal(result.bytes.byteLength,98000);
  assert.ok(result.size<=MAX_STORED_PHOTO_BYTES);
  assert.ok(result.width<=1080&&result.height<=1080);
});
test("browser senza WebP deve fallire senza inviare dati",async()=>{
  const canvas={getContext:()=>({drawImage:()=>{}}),toBlob:cb=>cb(new Blob(["text"],{type:"image/png"}))};
  await assert.rejects(compressPhoto(file(),{
    decode:async()=>({width:500,height:800,close(){}}),makeCanvas:()=>canvas
  }),/WebP/);
});
test("immagini sospette per dimensioni vengono respinte",async()=>{
  await assert.rejects(compressPhoto(file(),{
    decode:async()=>({width:15000,height:15000,close(){}}),makeCanvas:()=>{throw Error("should not call");}
  }),/Dimensioni/);
});
