import { createHash } from 'node:crypto';

/**
 * CRITICAL: two snapshots are PINNED, not downloaded from Firebase.
 * Legacy source: gernotfound/pianta@acc510e2667bf3cbab8c576942a0f0de2df14ed2/firestore.rules.
 * This matches the legacy-shaped Rules supplied by the Piante product owner.
 * A source change requires explicit review, a new fixture and test evidence.
 * The output is used EXCLUSIVELY for Firestore Emulator tests.
 */
export const LEGACY_GIT_BLOB = '4953d4ca66305e4db39b38acbc8d738650b536e9';
export const PIANTE_TEST_GIT_BLOB = '5ef2cb7385d65fbb58bbcf54973ba26bfc207be9';
const legacyEnd = '\n  }\n}\n';
const pianteStart = '    function invitedOwner(uid) {';
const pianteEnd = '    // No public catalog or legacy grants in these test-only rules.';

export function blobSha(text) {
  const bytes = Buffer.byteLength(text, 'utf8');
  return createHash('sha1').update('blob '+bytes+'\0').update(text,'utf8').digest('hex');
}
export function combineLegacyAndPiante(legacy, piante) {
  if(blobSha(legacy)!==LEGACY_GIT_BLOB)throw Error('Legacy Rules snapshot changed: compatibility baseline requires review');
  if(blobSha(piante)!==PIANTE_TEST_GIT_BLOB)throw Error('Piante lab Rules changed: compatibility addition requires review');
  if(!legacy.endsWith(legacyEnd))throw Error('Unknown legacy Rules envelope');
  const from=piante.indexOf(pianteStart),to=piante.indexOf(pianteEnd);
  if(from<0||to<=from)throw Error('Unknown isolated Piante Rules structure');
  const addition=piante.slice(from,to);
  if(/^    match \/users\//m.test(addition) || /^    match \/\{path=\*\*\}\s*\{/m.test(addition)) {
    throw Error('Proposed Piante addition overlaps the protected legacy namespace');
  }
  const boundary=legacy.length-legacyEnd.length;
  const combined=legacy.slice(0,boundary)+'\n'+addition+legacy.slice(boundary);
  if(combined.replace('\n'+addition,'')!==legacy)throw Error('Legacy content was modified');
  return combined;
}
