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
      await assertFails(alice.doc("handles/secondo-giardino").set({ownerUid:"alice"}));
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
      await assertFails(alice.doc("profiles/alice").update({displayName:"Aggiornamento isolato"}));
      await assertFails(alice.doc("profiles/alice/plants/avocado-123").update({createdAt:456}));
    });
    await t.test("vetrina invisibile non leggibile da anonimi",async()=>{
      await assertFails(anonymous.doc("public_gardens/"+username).get());
      await assertFails(anonymous.doc("public_gardens/"+username+"/plants/avocado-123").get());
    });
    await t.test("pubblicazione atomica e non divulgazione di campi non autorizzati",async()=>{
      const priv=alice.doc("profiles/alice/plants/avocado-123");
      const pub=alice.doc("public_gardens/"+username+"/plants/avocado-123");
      await assertFails(pub.set({name:"Avocado",tags:["Esotica"],updatedAt:124}));
      await assertFails(priv.update({published:true,shareTags:true,updatedAt:124}));
      await assertFails(alice.doc("public_gardens/"+username+"/plants/inesistente").set({
        name:"Senza privato",updatedAt:123
      }));

      const publish=alice.batch();
      publish.update(priv,{published:true,shareTags:true,updatedAt:124});
      publish.set(pub,{name:"Avocado",tags:["Esotica"],updatedAt:124});
      await assertSucceeds(publish.commit());

      await assertFails(pub.update({description:"NOTA PRIVATA"}));
      await assertFails(pub.update({name:"Pianta inventata"}));
      await assertFails(pub.update({tags:["Altro"]}));
      await assertFails(pub.set({name:"Avocado",tags:["Esotica"],updatedAt:124, notePrivate:"Esposizione"}));
      await assertFails(bob.doc("public_gardens/"+username+"/plants/avocado-123").delete());
      await assertFails(pub.delete());
      await assertFails(priv.update({published:false,updatedAt:125}));

      const retire=alice.batch();
      retire.update(priv,{published:false,updatedAt:125});
      retire.delete(pub);
      await assertSucceeds(retire.commit());

      await assertFails(anonymous.doc("public_gardens/"+username+"/plants/avocado-123").get());
    });
    await t.test("visibilità del giardino aggiornata in un solo batch",async()=>{
      const priv=alice.doc("profiles/alice");
      const pub=alice.doc("public_gardens/"+username);
      await assertFails(pub.update({visible:true}));
      await assertFails(priv.update({visible:true}));
      const activate=alice.batch();
      activate.update(priv,{visible:true});
      activate.update(pub,{visible:true});
      await assertSucceeds(activate.commit());
      await assertSucceeds(anonymous.doc("public_gardens/"+username).get());

      const deactivate=alice.batch();
      deactivate.update(priv,{visible:false});
      deactivate.update(pub,{visible:false});
      await assertSucceeds(deactivate.commit());
      await assertFails(anonymous.doc("public_gardens/"+username).get());
    });
    await t.test("revoca del grant senza eliminazione dei dati",async()=>{
      await env.withSecurityRulesDisabled(async ctx=>{
        await ctx.firestore().doc("access_grants/alice").set({enabled:false});
      });
      await assertFails(alice.doc("profiles/alice").get());
      await assertFails(alice.doc("profiles/alice/plants/avocado-123").get());
      await assertFails(alice.doc("public_gardens/"+username).update({visible:true}));
      await env.withSecurityRulesDisabled(async ctx=>{
        await ctx.firestore().doc("access_grants/alice").set({enabled:true});
      });
      await assertSucceeds(alice.doc("profiles/alice").get());
    });
  } finally {
    await env.cleanup();
  }
});
