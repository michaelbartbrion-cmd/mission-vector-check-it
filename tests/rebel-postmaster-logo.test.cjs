const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../beta/rebel-postmaster.user.js'), 'utf8');

test('Postmaster retains the original Rebel PNG emblem in both launcher states', () => {
  const line = source.split(/\r?\n/).find(s => s.startsWith('const REBEL_SYMBOL_HTML='));
  assert.ok(line, 'Rebel emblem constant must exist');
  const literal = line.slice('const REBEL_SYMBOL_HTML='.length).replace(/;$/, '');
  const html = JSON.parse(literal);
  assert.match(html, /<img\b/i);
  const match = html.match(/src="data:image\/png;base64,([^"]+)"/);
  assert.ok(match, 'inline Rebel emblem must use the original self-contained PNG');
  const image = Buffer.from(match[1], 'base64');
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(image.length > 3000, 'emblem bytes must not be a placeholder');
  assert.match(source, /close\.innerHTML=REBEL_SYMBOL_HTML/);
  assert.match(source, /orb\.innerHTML=REBEL_SYMBOL_HTML/);
});

test('Rebel branding retains read-only Outlook scope across later version bumps', () => {
  const metadata=source.match(/@version\s+(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(metadata,'version metadata is required');
  assert.match(source,new RegExp("const VERSION='rebel-postmaster-"+metadata.replace(/\./g,'\\.')+"'"));
  assert.ok(Number(metadata.split('.')[2])>=13,'logo first shipped in 1.2.13');
  assert.ok(source.includes('v'+metadata+' · read-only Outlook collector'));
  assert.match(source, /@match\s+https:\/\/outlook\.cloud\.microsoft\/\*/);
  assert.match(source, /Postmaster never opens unread mail for you/);
});

test('Postmaster launcher matches Vector Rebel and Rebel IQ sizing and emblem',()=>{
  const vector=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
  const iq=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
  const emblem=s=>s.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1];
  assert.equal(emblem(source),emblem(vector));assert.equal(emblem(source),emblem(iq));
  assert.match(source,/\.orb\{width:54px;height:54px;min-width:54px/);
  assert.match(source,/\.orb\.header-orb\{width:43px;height:43px;min-width:43px/);
  assert.doesNotMatch(source,/\.orb\.header-orb img\{/);
  assert.match(source,/box-shadow:0 2px 8px rgba\(0,0,0,\.18\)/);
});
