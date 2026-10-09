import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combineLegacyAndPiante,blobSha,LEGACY_GIT_BLOB,PIANTE_TEST_GIT_BLOB} from './compose-compat-rules.mjs';
const legacy=readFileSync('tests/fixtures/pianta-legacy-user-reported.rules','utf8');
const isolated=readFileSync('firestore.m2-test.rules','utf8');
describe('M4a additive Firestore rule rehearsal (NO LIVE DEPLOY)',()=>{
  it('pins both original snapshots and preserves every legacy byte',()=>{
    assert.equal(blobSha(legacy),LEGACY_GIT_BLOB);
    assert.equal(blobSha(isolated),PIANTE_TEST_GIT_BLOB);
    const merged=combineLegacyAndPiante(legacy,isolated);
    assert.ok(merged.includes('match /users/{userId}'));
    assert.ok(merged.includes('match /piante_users/{uid}'));
    assert.ok(merged.includes('match /piante_access/{uid}'));
    assert.equal(merged.split('match /users/{userId}').length,2);
    assert.equal(merged.split('match /piante_users/{uid}').length,2);
    const from=isolated.indexOf('    function invitedOwner(uid) {');
    const to=isolated.indexOf('    // No public catalog or legacy grants in these test-only rules.');
    assert.equal(merged.replace('\n'+isolated.slice(from,to),''),legacy);
  });
  it('fails closed when either source is edited, including a seemingly harmless comment',()=>{
    assert.throws(()=>combineLegacyAndPiante(legacy+'\n',isolated),/snapshot changed/);
    assert.throws(()=>combineLegacyAndPiante(legacy,isolated+'\n'),/lab Rules changed/);
  });
});
