import { z } from 'zod';
import { localEnvelopeSchema, type LocalEnvelope, type LocalGardenRepository } from '../storage/localRepository';
import { buildReconciliationPreview } from '../cloud/reconciliationPreview';

export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const backupSchema = z.strictObject({
  kind: z.literal('piante-private-backup'),
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  envelope: localEnvelopeSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
});
export type BackupInspection = {
  ownerScope: string;
  plants: number;
  places: number;
  events: number;
  pending: number;
  remoteReceipts: number;
  exportedAt: string;
  backupQuarantined: boolean;
};
function assertOwner(ownerScope: string, envelope: LocalEnvelope): void {
  if (!/^user:[A-Za-z0-9_-]{1,96}$/.test(ownerScope) || envelope.ownerScope !== ownerScope) {
    throw new Error('Il backup appartiene a un account differente');
  }
}
function verifyReplay(ownerScope: string, envelope: LocalEnvelope): void {
  assertOwner(ownerScope,envelope);
  const uid=ownerScope.slice('user:'.length);
  // A Zod-valid JSON record alone does not establish domain consistency.
  // Reconstruct every referenced entity and operation before allowing recovery.
  buildReconciliationPreview(uid,envelope.remoteReceipts,envelope);
}
function payloadOf(exportedAt:string,envelope:LocalEnvelope) {
  return {kind:'piante-private-backup' as const,formatVersion:1 as const,exportedAt,envelope};
}
async function digest(payload:unknown):Promise<string> {
  if (typeof crypto==='undefined' || !crypto.subtle) throw new Error('SHA-256 sicuro non disponibile');
  const data=new TextEncoder().encode(JSON.stringify(payload));
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
function bytes(text:string):number{return new TextEncoder().encode(text).byteLength;}
function inspectEnvelope(envelope:LocalEnvelope,exportedAt:string):BackupInspection {
  return {
    ownerScope:envelope.ownerScope,exportedAt,
    plants:Object.keys(envelope.data.plants).length,
    places:Object.keys(envelope.data.places).length,
    events:Object.keys(envelope.data.events).length,
    pending:envelope.pending.length,
    remoteReceipts:envelope.remoteReceipts.length,
    backupQuarantined:envelope.backupQuarantined
  };
}

/** A complete owner-scoped, human-downloadable JSON backup; NO network calls. */
export async function createLocalBackup(
  repo: LocalGardenRepository,
  ownerScope:string,
  isStillAuthorized:()=>boolean
):Promise<string>{
  if(!isStillAuthorized())throw new Error('Sessione non autorizzata');
  const envelope=localEnvelopeSchema.parse(await repo.read());
  verifyReplay(ownerScope,envelope);
  if(!isStillAuthorized())throw new Error('Sessione cambiata');
  const payload=payloadOf(new Date().toISOString(),envelope);
  const sha256=await digest(payload);
  if(!isStillAuthorized())throw new Error('Sessione cambiata');
  const serialized=JSON.stringify({...payload,sha256},null,2);
  if(bytes(serialized)>MAX_BACKUP_BYTES)throw new Error('Archivio troppo grande per l’esportazione JSON');
  return serialized;
}

/** Only a verified preview. No import side effects, even for malformed input. */
export async function inspectLocalBackup(
  json:string,
  ownerScope:string,
  isStillAuthorized:()=>boolean
):Promise<BackupInspection>{
  if(!isStillAuthorized())throw new Error('Sessione non autorizzata');
  if(bytes(json)>MAX_BACKUP_BYTES)throw new Error('File oltre il limite di 32 MiB');
  let raw:unknown;
  try{raw=JSON.parse(json) as unknown;}
  catch{throw new Error('JSON del backup non valido');}
  const candidate=backupSchema.safeParse(raw);
  if(!candidate.success)throw new Error('Formato, versione o schema del backup non valido');
  const {kind,formatVersion,exportedAt,envelope,sha256}=candidate.data;
  assertOwner(ownerScope,envelope);
  const actual=await digest({kind,formatVersion,exportedAt,envelope});
  if(actual!==sha256)throw new Error('Integrità SHA-256 del backup non valida');
  verifyReplay(ownerScope,envelope);
  if(!isStillAuthorized())throw new Error('Sessione cambiata');
  return inspectEnvelope(envelope,exportedAt);
}

/**
 * Explicit second action after preview: restore only into an EMPTY owner scope.
 * This copies the full journal without silently dropping history and quarantines
 * cloned replica IDs, so future cloud sync cannot upload this imported archive.
 */
export async function restoreLocalBackup(
  repo:LocalGardenRepository,
  json:string,
  ownerScope:string,
  isStillAuthorized:()=>boolean
):Promise<LocalEnvelope>{
  await inspectLocalBackup(json,ownerScope,isStillAuthorized);
  const parsed=backupSchema.parse(JSON.parse(json) as unknown);
  if(!isStillAuthorized())throw new Error('Sessione cambiata');
  return repo.restoreEmptyFromBackup(parsed.envelope,isStillAuthorized);
}
