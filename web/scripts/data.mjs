import { cleanProfile, validUsername, usernameValue, toPublicPlant, cleanText } from "./domain.mjs";

export function makeDataClient({db, api}) {
  const {
    doc, collection, getDoc, getDocs, runTransaction, writeBatch, setDoc,
    deleteDoc
  } = api;
  const privateRoot = uid => doc(db, "profiles", uid);
  const plantsRef = uid => collection(db, "profiles", uid, "plants");
  const tagsRef = uid => collection(db, "profiles", uid, "tags");
  const publicRoot = handle => doc(db, "public_gardens", handle);
  const publicPlant = (handle, id) => doc(db, "public_gardens", handle, "plants", id);
  const handleRef = handle => doc(db, "handles", handle);
  const fromSnap = snap => ({id:snap.id,...snap.data()});

  return {
    async privateProfile(uid) {
      const snapshot = await getDoc(privateRoot(uid));
      return snapshot.exists() ? snapshot.data() : null;
    },
    async register(uid, input) {
      const username = usernameValue(input.username);
      if (!validUsername(username)) throw new Error("Scegli un nome utente di 3–30 caratteri, lettere, numeri e trattini semplici.");
      const publicFields = cleanProfile(input);
      await runTransaction(db, async transaction => {
        const [claim, existing] = await Promise.all([
          transaction.get(handleRef(username)),
          transaction.get(privateRoot(uid))
        ]);
        if (existing.exists()) throw new Error("Questo account ha già un profilo.");
        if (claim.exists()) throw new Error("Nome utente già utilizzato.");
        transaction.set(handleRef(username), {ownerUid:uid});
        transaction.set(privateRoot(uid), {username,...publicFields});
        transaction.set(publicRoot(username), {...publicFields,updatedAt:Date.now()});
      });
      return {username,...publicFields};
    },
    async saveProfile(uid, current, input) {
      const fields = cleanProfile(input);
      const batch = writeBatch(db);
      batch.update(privateRoot(uid), fields);
      batch.set(publicRoot(current.username), {...fields,updatedAt:Date.now()});
      await batch.commit();
      return {...current,...fields};
    },
    async privatePlants(uid) {
      const snapshot = await getDocs(plantsRef(uid));
      return snapshot.docs.map(fromSnap).sort((a,b)=>b.updatedAt-a.updatedAt);
    },
    async privateTags(uid) {
      const snapshot = await getDocs(tagsRef(uid));
      return snapshot.docs.map(fromSnap).sort((a,b)=>a.name.localeCompare(b.name,"it"));
    },
    async addTag(uid, name) {
      name = cleanText(name,32);
      if (!name) throw new Error("Scrivi il nome del tag.");
      const id = crypto.randomUUID();
      await setDoc(doc(db,"profiles",uid,"tags",id),{name});
      return {id,name};
    },
    async savePlant(uid, username, id, plant) {
      const batch = writeBatch(db);
      batch.set(doc(db,"profiles",uid,"plants",id),plant);
      const publicData = toPublicPlant(plant);
      if (publicData) batch.set(publicPlant(username,id),publicData);
      else batch.delete(publicPlant(username,id));
      await batch.commit();
    },
    async removePlant(uid, username, id) {
      const batch = writeBatch(db);
      batch.delete(doc(db,"profiles",uid,"plants",id));
      batch.delete(publicPlant(username,id));
      await batch.commit();
    },
    async publicGarden(username) {
      if (!validUsername(username)) return null;
      try {
        const snap = await getDoc(publicRoot(username));
        if (!snap.exists() || snap.data().visible !== true) return null;
        const plants = await getDocs(collection(db,"public_gardens",username,"plants"));
        return {username, ...snap.data(), plants:plants.docs.map(fromSnap).sort((a,b)=>b.updatedAt-a.updatedAt)};
      } catch (error) {
        if (error.code === "permission-denied") return null;
        throw error;
      }
    },
    async publicPlant(username, plantId) {
      const garden = await this.publicGarden(username);
      if (!garden) return null;
      return {garden,plant:garden.plants.find(plant=>plant.id===plantId) || null};
    }
  };
}
