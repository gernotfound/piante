import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { cloudJournalRecordSchema, type CloudJournalPort, type CloudJournalRecord } from './journal';

/**
 * Adapter is never imported by the UI and MUST NOT run against the shared live
 * Firestore until Rules reconciliation and lifecycle/security reviews are complete.
 */
function normalized(record: unknown): string {
  return JSON.stringify(cloudJournalRecordSchema.parse(record));
}

export function firestoreJournalPort(db: Firestore): CloudJournalPort {
  return {
    async appendOnce(input: CloudJournalRecord) {
      const record = cloudJournalRecordSchema.parse(input);
      const ref = doc(db, 'piante_users', record.ownerUid, 'operations', record.operationId);
      return runTransaction(db, async tx => {
        const existing = await tx.get(ref);
        if (existing.exists()) {
          if (normalized(existing.data()) !== normalized(record)) {
            throw new Error('Collisione tra operazioni con identità identica');
          }
          return 'duplicate' as const;
        }
        tx.set(ref, record);
        return 'created' as const;
      }, { maxAttempts: 5 });
    }
  };
}
