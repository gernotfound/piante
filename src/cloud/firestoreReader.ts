import {
  collection, getDocsFromServer, limit, query, type Firestore
} from 'firebase/firestore';
import {
  MAX_PREVIEW_OPERATIONS, ReconciliationBlocked, type CloudJournalReader
} from './reconciliationPreview';

/**
 * Single bounded SERVER snapshot. Never return a truncated result as complete
 * and never substitute persistent/offline Firestore cache.
 */
export function firestoreJournalReader(db: Firestore): CloudJournalReader {
  return {
    async readAll(ownerUid, max = MAX_PREVIEW_OPERATIONS) {
      if (!/^[A-Za-z0-9_-]{1,96}$/.test(ownerUid)) throw new ReconciliationBlocked('identity-changed');
      if (!Number.isSafeInteger(max) || max < 1 || max > MAX_PREVIEW_OPERATIONS) {
        throw new ReconciliationBlocked('limit-exceeded');
      }
      const ref = collection(db, 'piante_users', ownerUid, 'operations');
      const snapshot = await getDocsFromServer(query(ref, limit(max + 1)));
      if (snapshot.size > max) throw new ReconciliationBlocked('limit-exceeded');
      return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() as unknown }));
    }
  };
}
