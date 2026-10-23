import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from "@firebase/rules-unit-testing";

const rules=await readFile(new URL("../firestore.rules",import.meta.url),"utf8");
const env=await initializeTestEnvironment({
  projectId:"demo-piante-rules",
  firestore:{host:"127.0.0.1",port:8087,rules}
});

test("Firestore Rules: proprietà, registrazione, isolamento e pubblicazione", async t=>{
  const alice=env.authenticatedContext("alice").firestore();
  const bob=env.authenticatedContext("bob").firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const unapproved=env.authenticatedContext("unapproved").firestore();
  const username="giardino-alice";

  try {
    await env.withSecurityRulesDisabled(async ctx => {
      const admin=ctx.firestore();
      await admin.doc("access_grants/alice").set({enabled:true});
      await admin.doc("access_grants/bob").set({enabled:true});
    });
    await t.test("default deny per il vecchio namespace e per gli sconosciuti",async()=>{
      await assertFails(anonymous.doc("users/alice").get());
      await assertFails(alice.doc("users/alice").set({migrated:true}));
      await assertFails(alice.doc("admin/secrets").get());
      await assertFails(unapproved.doc("profiles/unapproved").get());
      await assertFails(unapproved.doc("handles/giardino-unapproved").set({ownerUid:"unapproved"}));
      await assertFails(alice.doc("access_grants/alice").delete());
    });
    await t.test("registrazione atomica profilo e handle",async()=>{
      await assertSucceeds(alice.runTransaction(async tx=>{
        const handle=alice.doc("handles/"+username);
        const profile=alice.doc("profiles/alice");
        const [existingHandle,existingProfile]=await Promise.all([tx.get(handle),tx.get(profile)]);
        if(existingHandle.exists||existingProfile.exists) throw Error("Collisione inattesa nel test");
        tx.set(handle,{ownerUid:"alice"});
        tx.set(profile,{username,displayName:"Giardino Alice",about:"",visible:false});
        tx.set(alice.doc("public_gardens/"+username),{
          displayName:"Giardino Alice",about:"",visible:false,updatedAt:123
        });
      }));
      await assertSucceeds(alice.doc("profiles/alice").get());
      await assertFails(bob.doc("profiles/alice").get());
      await assertFails(anonymous.doc("profiles/alice").get());
      await assertFails(bob.doc("handles/"+username).set({ownerUid:"bob"}));
      await assertFails(alice.doc("handles/login").set({ownerUid:"alice"}));
    });
    await t.test("le schede private sono leggibili solo dal proprietario",async()=>{
      const privatePlant={
        name:"Avocado",scientificName:"Persea americana",description:"Nota privata",
        imageUrl:"",tags:["Esotica"],published:false,
        shareScientificName:false,shareDescription:false,shareTags:false,shareImage:false,
        createdAt:123,updatedAt:123
      };
      await assertSucceeds(alice.doc("profiles/alice/plants/avocado-123").set(privatePlant));
      await assertFails(bob.doc("profiles/alice/plants/avocado-123").get());
      await assertFails(anonymous.doc("profiles/alice/plants/avocado-123").get());
      await assertFails(bob.doc("profiles/alice/plants/avocado-123").delete());
    });
    await t.test("vetrina invisibile non leggibile da anonimi",async()=>{
      await assertFails(anonymous.doc("public_gardens/"+username).get());
      await assertFails(anonymous.doc("public_gardens/"+username+"/plants/avocado-123").get());
    });
    await t.test("pubblicazione allowlist e blocco cross-account",async()=>{
      await assertSucceeds(alice.doc("public_gardens/"+username+"/plants/avocado-123").set({
        name:"Avocado",tags:["Esotica"],updatedAt:123
      }));
      await assertFails(alice.doc("public_gardens/"+username+"/plants/malformata").set({
        name:"Segreta",notePrivate:"Non pubblicare",updatedAt:123
      }));
      await assertFails(bob.doc("public_gardens/"+username+"/plants/avocado-123").set({
        name:"Intruso",updatedAt:123
      }));
      await assertSucceeds(alice.doc("public_gardens/"+username).update({visible:true}));
      await assertSucceeds(anonymous.doc("public_gardens/"+username).get());
      await assertSucceeds(anonymous.doc("public_gardens/"+username+"/plants/avocado-123").get());
      await assertSucceeds(alice.doc("public_gardens/"+username).update({visible:false}));
      await assertFails(anonymous.doc("public_gardens/"+username).get());
      await assertFails(anonymous.doc("public_gardens/"+username+"/plants/avocado-123").get());
    });
  } finally {
    await env.cleanup();
  }
});
