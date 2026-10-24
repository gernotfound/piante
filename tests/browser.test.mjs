import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";

test("homepage e login si adattano a smartphone, tablet e desktop",async()=>{
  const server=spawn("python3",["-m","http.server","8765","--bind","127.0.0.1","--directory","web"],{stdio:"ignore"});
  let browser;
  try {
    let ready=false;
    for(let retry=0;retry<40;retry++){
      try { const response=await fetch("http://127.0.0.1:8765");if(response.ok){ready=true;break;} }
      catch { await new Promise(resolve=>setTimeout(resolve,150)); }
    }
    assert.ok(ready,"Il server statico non è partito.");
    for (const [browserName, engine] of [["Chromium",chromium],["WebKit",webkit]]) {
      browser=await engine.launch({
        headless:true,
        ...(browserName==="Chromium" ? {args:["--no-sandbox"]} : {})
      });
      for(const [width,height] of [[320,720],[375,812],[768,1024],[1440,900]]){
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      try {
        const errors=[];
        page.on("pageerror",error=>errors.push(error.message));
        await page.goto("http://127.0.0.1:8765/",{waitUntil:"networkidle"});
        assert.match(await page.locator("h1").first().innerText(),/Ogni pianta ha/i);
        const dim=await page.evaluate(()=>({
          doc:document.documentElement.scrollWidth,
          viewport:document.documentElement.clientWidth,
          body:document.body.scrollWidth
        }));
        assert.ok(dim.doc<=dim.viewport+2, "Overflow orizzontale su "+width+"px: "+JSON.stringify(dim));
        const art=page.locator(".hero-art img");
        assert.ok(await art.isVisible(),"L'illustrazione botanica deve risultare visibile.");
        assert.equal(await art.evaluate(img=>img.naturalWidth>0),true,"SVG non caricato");
        await page.locator('a[href="/login"]').first().click();
        await page.waitForURL("**/login");
        assert.match(await page.locator("h2").first().innerText(),/Bentornato/i);
        assert.equal(await page.locator("#google-login").isDisabled(),true,"Login senza config deve restare disabilitato.");
        assert.deepEqual(errors,[],"Errore JavaScript su "+browserName+" "+width+"px");
      } finally { await page.close(); }
      }
      await browser.close();
      browser=null;
    }
  } finally {
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
});
