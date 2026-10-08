import { z } from 'zod';
import { domainOperationSchema } from '../domain/schema';

export const uidSchema = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/);
export const cloudJournalRecordSchema = z.strictObject({
  protocol: z.literal(1),
  ownerUid: uidSchema,
  operationId: z.string().min(1).max(160),
  replicaId: z.uuid(),
  sequence: z.number().int().positive().safe(),
  appliedAt: z.number().int().nonnegative().safe(),
  operation: domainOperationSchema
}).superRefine((value, ctx) => {
  if (value.operationId !== `${value.replicaId}:${value.sequence}`) {
    ctx.addIssue({ code: 'custom', message: 'Identità dell’operazione incoerente' });
  }
});
export type CloudJournalRecord = z.infer<typeof cloudJournalRecordSchema>;

