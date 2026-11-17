'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function vectorScriptFramePositions(stack){');
const b=source.indexOf("    let lastUnexpectedErrorSignature = '';",a+1);
assert.ok(a>0&&b>a,'find real runtime error sanitization');
const fn=new Function(source.slice(a,b)+'\nreturn vectorScriptFramePositions;')();
test('returns only code location when a Vector Rebel frame is available',()=>{
 const trace="TypeError: Cannot read properties of undefined (reading 'props')\n"+
  "    at openForm (chrome-extension://some-extension/abc/vector-rebel.user.js:1234:55)\n"+
  "    at native (https://example.org/private/user/123456/react.min.js:99:2)";
 assert.equal(fn(trace),'1234:55');
});
test('recognizes embedded Tampermonkey userscript HTML source with no path leaks',()=>{
 const trace="TypeError: Cannot read properties of undefined\n"+
 " at f (chrome-extension://extension-secret/userscript.html?mytoken=abc123:456:10)\n"+
 " at f (chrome-extension://extension-secret/userscript.html?mytoken=abc123:456:10)\n"+
 " at x (chrome-extension://extension-secret/userscript.html:457:11)";
 assert.equal(fn(trace),'456:10, 457:11');
 assert.doesNotMatch(fn(trace),new RegExp('chrome-extension|token|abc123|/|[.]html'));
});
test('ignores third-party or undocumented frames without leaking routes',()=>{
 const trace="TypeError: X\n at react (https://vector.example.com/api/item/987654/react.min.js:200:30)\n at app (webpack://example/app.bundle.js:111:4)";
 assert.equal(fn(trace),'');
});
test('avoids zero and oversized positions and limits trace to three unique matches',()=>{
 const trace="Error\n"+
  " at a (vector-rebel.user.js:0:1)\n"+
  " at b (vector-rebel.user.js:100000:1)\n"+
  " at c (vector-rebel.user.js:120:4)\n"+
  " at d (vector-rebel.user.js:121:5)\n"+
  " at e (vector-rebel.user.js:122:6)\n"+
  " at f (vector-rebel.user.js:123:7)";
 assert.equal(fn(trace),'120:4, 121:5, 122:6');
});
test('actual runtime failure reporting includes safe script locations and queues details',()=>{
 const segment=source.slice(b,source.indexOf("    window.addEventListener('error'",b));
 assert.ok(segment.includes('scriptPositions=vectorScriptFramePositions(error?.stack)'));
 assert.ok(segment.includes("void reportRebelErrorToCommand(debugReason,'runtime',kind)"));
 assert.ok(segment.includes("metadata: { stage: 'global', scriptPositions }"));
});
