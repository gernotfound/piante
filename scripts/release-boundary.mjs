/**
 * Static Firebase Hosting release boundary. This is NOT a live Firebase/Rules
 * audit and does not authorize deployment. Keep this guard dependency-free.
 */
export class ReleaseBoundaryError extends Error {
  constructor(code) {
    super('Piante release blocked: ' + code);
    this.name = 'ReleaseBoundaryError';
    this.code = code;
  }
}
function requireRelease(test,code) {
  if(!test)throw new ReleaseBoundaryError(code);
}
const forbidden = new Set(['firestore','storage','functions','database','remoteconfig','extensions','dataconnect','emulators']);
const csp = new Set(['content-security-policy','x-content-type-options','referrer-policy','x-frame-options']);

function ensureNoTestMode(sourceName,content) {
  for(const line of content.split(/\r?\n/)) {
    if(/^\s*(?:#|$)/.test(line))continue;
    const match=/^\s*(?:export\s+)?VITE_AUTH_TEST_MODE\s*=\s*(.*?)\s*$/.exec(line);
    if(!match)continue;
    const raw=match[1].replace(/\s+#.*$/,'').trim();
    const value=(raw.startsWith('"')&&raw.endsWith('"'))||
      (raw.startsWith("'")&&raw.endsWith("'"))?raw.slice(1,-1):raw;
    requireRelease(value==='false','test-login-must-be-disabled ['+sourceName+']');
  }
}

/**
 * Validate only what the repository can actually prove. It cannot inspect the
 * provider, its deployed Rules, OAuth/IAM, Firebase Auth or current Hosting.
 */
export function assertStaticReleaseBoundary({
  firebaseConfig,projectConfig,environmentFiles=[],environment={}
}) {
  requireRelease(firebaseConfig && typeof firebaseConfig==='object'&&!Array.isArray(firebaseConfig),'firebase-json-invalid');
  requireRelease(projectConfig && typeof projectConfig==='object'&&!Array.isArray(projectConfig),'firebaserc-invalid');
  for(const key of Object.keys(firebaseConfig)) {
    requireRelease(!forbidden.has(key.toLowerCase()),'forbidden-firebase-resource:'+key);
  }
  requireRelease(Object.keys(firebaseConfig).length===1&&Object.hasOwn(firebaseConfig,'hosting'),
    'firebase-config-must-be-hosting-only');
  const hosting=firebaseConfig.hosting;
  requireRelease(hosting&&typeof hosting==='object'&&!Array.isArray(hosting),'hosting-config-invalid');
  requireRelease(hosting.site==='piante','wrong-hosting-site');
  requireRelease(hosting.public==='dist','wrong-hosting-directory');
  requireRelease(!Object.hasOwn(hosting,'target')&&!Object.hasOwn(hosting,'predeploy')&&!Object.hasOwn(hosting,'postdeploy'),
    'hosting-hooks-or-target-not-allowed');
  requireRelease(Array.isArray(hosting.rewrites)&&hosting.rewrites.length===1&&
    hosting.rewrites[0]?.source==='**'&&hosting.rewrites[0]?.destination==='/index.html'&&
    Object.keys(hosting.rewrites[0]).length===2,'hosting-rewrites-changed');
  requireRelease(!Object.hasOwn(hosting,'redirects'),'hosting-redirects-not-reviewed');
  const allowedHostingKeys=new Set(['site','public','ignore','cleanUrls','trailingSlash','headers','rewrites']);
  requireRelease(Object.keys(hosting).every(key=>allowedHostingKeys.has(key)),
    'unsupported-hosting-directive');

  requireRelease(Array.isArray(hosting.headers),'hosting-security-headers-missing');
  const securityHeaders=new Set(
    hosting.headers.filter(row=>row.source==='/**'&&Array.isArray(row.headers))
      .flatMap(row=>row.headers.map(header=>String(header.key).toLowerCase()))
  );
  requireRelease([...csp].every(key=>securityHeaders.has(key)),'hosting-security-headers-missing');
  const baseHeaders=hosting.headers.filter(row=>row.source==='/**');
  requireRelease(baseHeaders.length===1,'hosting-security-headers-missing');
  const requiredSecurityValues=new Map([
    ['x-content-type-options','nosniff'],
    ['x-frame-options','DENY'],
    ['referrer-policy','strict-origin-when-cross-origin']
  ]);
  for(const [key,value] of requiredSecurityValues) {
    const actual=baseHeaders[0].headers.filter(header=>String(header.key).toLowerCase()===key);
    requireRelease(actual.length===1&&actual[0].value===value,'hosting-security-header-weakened:'+key);
  }
  const cspRows=baseHeaders[0].headers.filter(header=>String(header.key).toLowerCase()==='content-security-policy');
  const policy=cspRows[0]?.value;
  requireRelease(cspRows.length===1&&typeof policy==='string'&&
    ["default-src 'self'","object-src 'none'","frame-ancestors 'none'","base-uri 'self'"]
      .every(directive=>policy.split(';').some(part=>part.trim()===directive))&&
    !/unsafe-eval|unsafe-inline|https?:\/\/\*|\bdata:.*script-src/.test(policy),
    'hosting-content-security-policy-weakened');
  // A path-specific security header may override the safe catch-all.
  requireRelease(hosting.headers.filter(row=>row.source!=='/**').every(row=>
    Array.isArray(row.headers)&&row.headers.every(h=>!csp.has(String(h.key).toLowerCase()))),
    'overlapping-hosting-security-header');

  requireRelease(projectConfig.projects && typeof projectConfig.projects==='object' &&
    !Array.isArray(projectConfig.projects)&&
    Object.keys(projectConfig.projects).length===1&&projectConfig.projects.default==='pianta-db',
    'wrong-firebase-project');
  requireRelease(Object.keys(projectConfig).length===1,'unexpected-firebase-project-settings');
  for(const file of environmentFiles) {
    requireRelease(file && typeof file.name==='string' && typeof file.content==='string',
      'invalid-env-input');
    ensureNoTestMode(file.name,file.content);
  }
  if(Object.hasOwn(environment,'VITE_AUTH_TEST_MODE')) {
    requireRelease(environment.VITE_AUTH_TEST_MODE==='false',
      'test-login-must-be-disabled [process-env]');
  }
  return {status:'static-release-boundary-ok',site:'piante',project:'pianta-db',authentication:'disabled'};
}
