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

test('logo-only version bump retains read-only Outlook scope', () => {
  assert.match(source, /@version\s+1\.2\.13/);
  assert.match(source, /const VERSION='rebel-postmaster-1\.2\.13'/);
  assert.match(source, /v1\.2\.13 · read-only Outlook collector/);
  assert.match(source, /@match\s+https:\/\/outlook\.cloud\.microsoft\/\*/);
  assert.match(source, /Postmaster never opens unread mail for you/);
});
