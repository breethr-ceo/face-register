import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5177');
 await page.getByText('Connect your registry',{exact:true}).waitFor();
 assert.equal(await page.locator('#submit').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.waitForFunction(()=>!!window.faceapi);
 const result=await page.evaluate(async()=>{const {describeFace}=await import('/src/face.js');const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);try{await describeFace(c);return 'unexpected success';}catch(e){return e.message;}});
 assert.match(result,/No face found/);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
 console.log('Mobile layout, setup state, local model loading, and no-face inference passed.');
}finally{await browser.close();}
