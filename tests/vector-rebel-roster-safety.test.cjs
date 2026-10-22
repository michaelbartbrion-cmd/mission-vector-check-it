'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
function fragment(startName, endName) {
    const start = script.indexOf('    ' + startName);
    const end = script.indexOf('    ' + endName, start + 1);
    assert.ok(start >= 0 && end > start, startName + ' function boundaries');
    return script.slice(start, end);
}
const source = [
    fragment('function ownerRosterKey(name) {', 'function rosterNeedsReview(people) {'),
    fragment('function responsiblePartyPpeRow(anchor) {', 'function getPaginationControl(kind) {'),
    fragment('async function scanPpeRosterCandidates(progress = null) {', 'function peopleDirectoryToText(people) {'),
    fragment('async function discoverOwnerGear(owner, modeKey, inventory) {', 'function getGearSnapshots() {')
].join('\n') + '\nreturn {ownerRosterKey,rosterHasPersonSpecificPrefix,responsiblePartyPpeRow,scanPpeOwnerInventory,scanPpeRosterCandidates,discoverOwnerGear};';
const clean = v => String(v ?? '').trim();
const nameKey = s => clean(s).toLowerCase().replace(/\s+/g,' ');
function makeRow(assetId, responsibleParty, location = 'Flower Mound Fire Department (TX)', status='In Service') {
    const texts = [assetId, 'Bunker Coat', location, responsibleParty, status];
    const cells = texts.map(t => ({innerText:t,textContent:t}));
    const table = { querySelectorAll: () => ['Name','Pool','Location','Responsible Party','Item Status']
        .map(t => ({innerText:t})) };
    const row = {
        closest: q => q === 'table' ? table : null,
        querySelectorAll: () => cells
    };
    // A stable Vector item URL exists independently of how a PPE name is formatted.
    // Different names must not collide merely because they have equal lengths.
    let id = 2166136261;
    for (const ch of assetId) id = Math.imul(id ^ ch.charCodeAt(0), 16777619) >>> 0;
    const itemId = String((id % 2000000000) + 1);
    return {row, getAttribute: () => '/app/equipment/PPE/pool/300045/' + itemId + '/item'};
}
function createHarness(anchors) {
    const fn = new Function('clean','masterNameKey','ppeRowForAnchor','isOrganizationOrBadRosterName',
        'getPoolType','location','ensurePpeEquipmentPage','getSearchInput','getPpeResultsContainer',
        'getVisiblePpeAnchors','visibleAssetLinksSignature','goToFirstPpePage','getPaginationControl',
        'paginationControlEnabled','normalizeMasterRoster','rosterNeedsReview','getMode',
        'nativeSetInput','sleep','waitForPpePageChange',source);
    return fn(clean,nameKey,a=>a.row,s=>!s || s==='-' || /fire department/i.test(s),
        ()=>'Bunker Coat',{origin:'https://app.vectorcheckit.us'},
        async()=>{},()=>({value:'',isConnected:true}),()=>({}),()=>anchors,
        ()=>'unique-first-and-last-page',async()=>{},()=>null,()=>false,
        people=>({people:people.map(({assetCount,...p})=>p),rejected:[],merged:[]}),
        ()=>[],()=>({templates:{'300045':'TEMPLATE'}}),()=>{},async()=>{},
        async()=>{});
}
test('reads numeric PPE Name field and Responsible Party instead of Location', () => {
    const api = createHarness([]);
    const one = api.responsiblePartyPpeRow(makeRow('0015609B','Oliver Walley'));
    const two = api.responsiblePartyPpeRow(makeRow('10237582','Ronnie McCarroll'));
    assert.equal(one.assetId,'0015609B');
    assert.equal(one.ownerName,'Oliver Walley');
    assert.equal(two.assetId,'10237582');
    assert.equal(two.ownerName,'Ronnie McCarroll');
    const none = api.responsiblePartyPpeRow(makeRow('10237642','-','Daniel Guerra-Herrera'));
    assert.equal(none.ownerName,'');
});
test('accepts real department asset names containing periods, spaces and punctuation', () => {
    const api = createHarness([]);
    for (const label of [
        'B.SMITH-10237612-FL',
        'B.SMITH-15784262-BU',
        'A. SMITH-0012',
        'WATER-RESCUE / 123',
        '0029381',
        'M-1470-000000038'
    ]) {
        const row = api.responsiblePartyPpeRow(makeRow(label,'Maggie Smith'));
        assert.equal(row.assetId,label.toUpperCase());
        assert.equal(row.ownerName,'Maggie Smith');
        assert.match(row.url,/\/app\/equipment\/PPE\/pool\//);
    }
});

test('unusable PPE name is rejected with the precise item identity, not an invented asset ID', () => {
    const api = createHarness([]);
    assert.throws(
        () => api.responsiblePartyPpeRow(makeRow('---','Maggie Smith')),
        /PPE Name missing or unusable for item 300045:/
    );
    assert.throws(
        () => api.responsiblePartyPpeRow(makeRow('','Maggie Smith')),
        /PPE Name missing or unusable for item 300045:/
    );
});

test('roster includes personnel with dotted asset IDs without stealing assignments', async () => {
    const api = createHarness([
        makeRow('B.SMITH-10237612-FL','Beth Smith'),
        makeRow('B.SMITH-15784262-BU','Beth Smith'),
        makeRow('ANDREW-4051221-FL','Andrew Jones')
    ]);
    const roster = await api.scanPpeRosterCandidates();
    assert.deepEqual(roster.people.map(p=>p.name).sort(), ['Andrew Jones','Beth Smith']);
    const inventory = await api.scanPpeOwnerInventory();
    const gear = await api.discoverOwnerGear({name:'Beth Smith'},'captain',inventory);
    assert.deepEqual(gear.items.map(x=>x.assetId).sort(),[
        'B.SMITH-10237612-FL','B.SMITH-15784262-BU'
    ]);
});

test('never turns M and WS0122 equipment series into the wrong person', async () => {
    const rows = [
        makeRow('M-1470-000000038','-','Christopher Hoogerwerf'),
        makeRow('WS0122-354','Ronnie McCarroll','Daniel Guerra-Herrera'),
        makeRow('BRION-10237792-FL','Michael Brion'),
        makeRow('10237582','Ronnie McCarroll'),
        makeRow('0015609B','Oliver Walley')
    ];
    const api = createHarness(rows);
    const roster = await api.scanPpeRosterCandidates();
    assert.deepEqual(roster.people.map(p=>p.name).sort(),
        ['Michael Brion','Oliver Walley','Ronnie McCarroll']);
    assert.equal(roster.unassignedCount,1);
    assert.ok(!roster.people.some(p=>/Christopher|Daniel/.test(p.name)));
    assert.ok(roster.people.every(p=>api.rosterHasPersonSpecificPrefix(p)));
    const inventory = await api.scanPpeOwnerInventory();
    const ronnie = await api.discoverOwnerGear({name:'Ronnie McCarroll'},'captain',inventory);
    assert.deepEqual(ronnie.items.map(x=>x.assetId).sort(),['10237582','WS0122-354']);
    assert.equal((await api.discoverOwnerGear({name:'Daniel Guerra-Herrera'},'captain',inventory)).items.length,0);
});
test('no explicit Responsible Party column means no roster and no inspection', () => {
    const row = makeRow('10237582','Ronnie McCarroll');
    row.row.closest = () => ({querySelectorAll:()=>[
        {innerText:'Name'},{innerText:'Location'}
    ]});
    assert.throws(()=>createHarness([]).responsiblePartyPpeRow(row),/Responsible Party/);
});
test('inspection discoverer refuses stale or unproven ownership inventories', async () => {
    const api = createHarness([]);
    await assert.rejects(()=>api.discoverOwnerGear({name:'Michael Brion'},'captain',
        {source:'Equipment-prefix guessing',items:[]}),/Responsible Party/);
    assert.doesNotMatch(script,/discoverOwnerGear\(owner\.prefix,/);
    assert.match(script,/const freshInventory = await scanPpeOwnerInventory/);
});
