'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function rowLooksLikeCompletedModeEntry(row, modeTitle) {');
const b=source.indexOf('    // Returns { rows, parserPath }',a);
assert.ok(a>=0&&b>a);
const rowLooks=new Function('itemLogRowText','uiIncludes','escapeRegex','uiText',
 source.slice(a,b)+'\nreturn rowLooksLikeCompletedModeEntry;')(
 row=>String(row.text), (hay,needle)=>String(hay).toLowerCase().includes(String(needle).toLowerCase()),
 value=>String(value), text=>String(text).replace(/\s+/g,' ').trim()
 );
test('native Vector item log with joined SCBA InspectionCOMPLETE counts as complete',()=>{
 assert.equal(rowLooks({text:'11/15/2026 Michael Brion Inspection SCBA InspectionCOMPLETE'},'SCBA Inspection'),true);
 assert.equal(rowLooks({text:'11/15/2026 Michael Brion Inspection SCBA Inspection COMPLETE'},'SCBA Inspection'),true);
});
test('Vector INCOMPLETE status does not count as completed',()=>{
 assert.equal(rowLooks({text:'11/15/2026 Michael Brion Inspection SCBA InspectionINCOMPLETE'},'SCBA Inspection'),false);
 assert.equal(rowLooks({text:'11/15/2026 Michael Brion Inspection SCBA Inspection INCOMPLETE'},'SCBA Inspection'),false);
 assert.equal(rowLooks({text:'11/15/2026 Michael Brion Inspection SCBA Inspection'},'SCBA Inspection'),false);
});
test('completion for a different inspection title is not a valid SCBA completion',()=>{
 assert.equal(rowLooks({text:'11/15/2026 Michael Brion Inspection Truck 504 Tour ChecklistCOMPLETE'},'SCBA Inspection'),false);
});
