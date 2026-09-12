(function (root, factory) {
    'use strict';
    let Engine = null;
    if (typeof module === 'object' && module.exports) {
        Engine = require('./rotation-engine.js');
        module.exports = factory(Engine);
    } else {
        Engine = root.VectorSchedulingEngine;
        root.VectorSchedulingHorizonPlanner = factory(Engine);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
    'use strict';

    if (!Engine) throw new Error('VectorSchedulingEngine is required.');

    function clean(value) { return Engine.clean(value); }
    function cloneCounts(counts) {
        const out = {};
        for (const [personId, row] of Object.entries(counts || {})) out[personId] = { ...row };
        return out;
    }

    function statsToState(stats, firefighterIds) {
        const counts = {};
        const totals = {};
        for (const id of firefighterIds) {
            const row = stats[id] || { counts:{}, total:0 };
            counts[id] = {};
            for (const category of Engine.CREDIT_CATEGORIES) counts[id][category] = Number(row.counts?.[category] || 0);
            totals[id] = Number(row.total || 0);
        }
        return { counts, totals };
    }

    function stateToStats(state, firefighterIds) {
        const out = {};
        for (const id of firefighterIds) {
            const counts = {};
            let total = Number(state?.totals?.[id] || 0);
            for (const category of Engine.CREDIT_CATEGORIES) counts[category] = Number(state?.counts?.[id]?.[category] || 0);
            if (!total) total = Object.values(counts).reduce((a,b)=>a+b,0);
            const ratios = {};
            for (const category of Engine.CREDIT_CATEGORIES) ratios[category] = total ? counts[category] / total : 0;
            out[id] = { counts, total, ratios };
        }
        return out;
    }

    function applyAssignment(state, assignmentByPerson, repeatCount=1) {
        const next = { counts: cloneCounts(state.counts), totals: { ...state.totals } };
        const n = Math.max(1, Number(repeatCount) || 1);
        for (const [personId, credit] of Object.entries(assignmentByPerson || {})) {
            if (!credit || !Object.prototype.hasOwnProperty.call(next.counts, personId)) continue;
            if (!Engine.CREDIT_CATEGORIES.includes(credit)) continue;
            next.counts[personId][credit] = Number(next.counts[personId][credit] || 0) + n;
            next.totals[personId] = Number(next.totals[personId] || 0) + n;
        }
        return next;
    }

    function stateSignature(state, firefighterIds) {
        const parts = [];
        for (const id of firefighterIds) {
            for (const category of Engine.CREDIT_CATEGORIES) parts.push(`${id}:${category}:${Number(state.counts?.[id]?.[category] || 0)}`);
        }
        return parts.join('|');
    }

    function assignmentSignature(assignmentByPerson, firefighterIds) {
        return firefighterIds.map(id => `${id}:${assignmentByPerson?.[id] || '-'}`).join('|');
    }

    function uniquePermutations(items) {
        const seen = new Set();
        const out = [];
        for (const perm of Engine.permutations(items || [])) {
            const key = perm.join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(perm);
        }
        return out;
    }

    function normalizeBlock(block, firefighterIds, index=0) {
        const availableIds = (block?.availableIds || []).filter(id => firefighterIds.includes(id));
        const repeatCount = Math.max(1, Number(block?.repeatCount || block?.days || 1) || 1);
        const scenario = block?.scenario || 'normal';
        const exactRoles = Array.isArray(block?.roles) ? block.roles.filter(Boolean) : null;
        const roles = exactRoles || Engine.roleSetForScenario(scenario, availableIds.length);
        const fixed = block?.fixedAssignmentByPerson && typeof block.fixedAssignmentByPerson === 'object'
            ? { ...block.fixedAssignmentByPerson } : {};
        return {
            id: block?.id || block?.date || `block-${index+1}`,
            date: block?.date || null,
            label: block?.label || block?.date || `Block ${index+1}`,
            availableIds,
            repeatCount,
            scenario,
            roles,
            fixedAssignmentByPerson: fixed,
            metadata: block?.metadata || null
        };
    }

    function optionsForBlock(block, firefighterIds) {
        const b = normalizeBlock(block, firefighterIds);
        const ids = b.availableIds;
        const roles = b.roles || [];
        if (ids.length < 2) return { block:b, options:[], reason:'Fewer than two tracked firefighters are available.' };
        if (roles.length !== ids.length) return { block:b, options:[], reason:`Role count ${roles.length} does not match available firefighter count ${ids.length}.` };

        const options = [];
        for (const perm of uniquePermutations(roles)) {
            const assignmentByPerson = {};
            ids.forEach((id,i) => { assignmentByPerson[id] = perm[i]; });
            let allowed = true;
            for (const [id,role] of Object.entries(b.fixedAssignmentByPerson || {})) {
                if (role && assignmentByPerson[id] !== role) { allowed = false; break; }
            }
            if (allowed) options.push(assignmentByPerson);
        }
        return {
            block:b,
            options,
            reason: options.length ? null : 'No assignment permutation satisfies the block constraints.'
        };
    }

    function fairnessOfState(state, firefighterIds) {
        return Engine.fairnessScore(stateToStats(state, firefighterIds), firefighterIds);
    }

    function trimNodes(nodes, firefighterIds, maxStates) {
        const byState = new Map();
        for (const node of nodes) {
            const key = stateSignature(node.state, firefighterIds);
            const prior = byState.get(key);
            if (!prior || node.cumulativeScore < prior.cumulativeScore) byState.set(key,node);
        }
        const unique = [...byState.values()];
        unique.sort((a,b) => a.score-b.score || a.cumulativeScore-b.cumulativeScore);
        if (unique.length <= maxStates) return unique;
        return unique.slice(0,maxStates);
    }

    function solveFuture(initialState, rawBlocks, firefighterIds, {maxStates=5000, allowUnplannable=true}={}) {
        const blocks = (rawBlocks || []).map((b,i)=>normalizeBlock(b,firefighterIds,i));
        let nodes = [{ state:initialState, score:fairnessOfState(initialState,firefighterIds), cumulativeScore:0, sequence:[], skipped:[] }];
        for (const block of blocks) {
            const optionResult = optionsForBlock(block,firefighterIds);
            if (!optionResult.options.length) {
                if (!allowUnplannable) return { nodes:[], reason:optionResult.reason, failedBlock:block };
                nodes = nodes.map(node => ({
                    ...node,
                    sequence:[...node.sequence,{ block, assignmentByPerson:null, skipped:true, reason:optionResult.reason }],
                    skipped:[...node.skipped,{ block, reason:optionResult.reason }]
                }));
                continue;
            }
            const expanded = [];
            for (const node of nodes) {
                for (const assignmentByPerson of optionResult.options) {
                    const state = applyAssignment(node.state,assignmentByPerson,block.repeatCount);
                    const score = fairnessOfState(state,firefighterIds);
                    expanded.push({
                        state,
                        score,
                        cumulativeScore:node.cumulativeScore + score,
                        sequence:[...node.sequence,{ block, assignmentByPerson, skipped:false, score }],
                        skipped:node.skipped
                    });
                }
            }
            nodes = trimNodes(expanded,firefighterIds,Math.max(10,Number(maxStates)||5000));
        }
        nodes.sort((a,b)=>a.score-b.score || a.cumulativeScore-b.cumulativeScore);
        return { nodes, reason:null };
    }

    function recommendScheduleHorizon({
        history,
        firefighterIds,
        blocks,
        startDate=null,
        endDate=null,
        maxStates=5000,
        limit=3,
        allowUnplannable=true
    }) {
        const ids = [...(firefighterIds || [])];
        if (!ids.length) return { recommendations:[], firstChoices:[], reason:'No firefighter IDs were supplied.' };
        const normalizedBlocks = (blocks || []).map((b,i)=>normalizeBlock(b,ids,i));
        if (!normalizedBlocks.length) return { recommendations:[], firstChoices:[], reason:'No future blocks were supplied.' };

        const currentStats = Engine.statsFromHistory(history || [],ids,startDate,endDate);
        const initialState = statsToState(currentStats,ids);
        const currentScore = Engine.fairnessScore(currentStats,ids);
        const first = optionsForBlock(normalizedBlocks[0],ids);
        if (!first.options.length) return { recommendations:[], firstChoices:[], currentStats, currentScore, reason:first.reason, failedBlock:first.block };

        const firstChoices = [];
        const fullCandidates = [];
        for (const firstAssignment of first.options) {
            const firstState = applyAssignment(initialState,firstAssignment,first.block.repeatCount);
            const immediateScore = fairnessOfState(firstState,ids);
            const solved = solveFuture(firstState,normalizedBlocks.slice(1),ids,{maxStates,allowUnplannable});
            const bestTail = solved.nodes[0] || { state:firstState, score:immediateScore, cumulativeScore:0, sequence:[], skipped:[] };
            const sequence = [{ block:first.block, assignmentByPerson:firstAssignment, skipped:false, score:immediateScore }, ...bestTail.sequence];
            const row = {
                firstAssignment,
                firstSignature:assignmentSignature(firstAssignment,ids),
                immediateScore,
                finalScore:bestTail.score,
                cumulativeScore:immediateScore + bestTail.cumulativeScore,
                immediateImprovement:currentScore-immediateScore,
                finalImprovement:currentScore-bestTail.score,
                sequence,
                projectedStats:stateToStats(bestTail.state,ids),
                skipped:bestTail.skipped || []
            };
            firstChoices.push(row);
            fullCandidates.push(row);
        }

        firstChoices.sort((a,b)=>a.finalScore-b.finalScore || a.cumulativeScore-b.cumulativeScore || a.immediateScore-b.immediateScore);
        fullCandidates.sort((a,b)=>a.finalScore-b.finalScore || a.cumulativeScore-b.cumulativeScore);
        return {
            recommendations:fullCandidates.slice(0,Math.max(1,Number(limit)||3)),
            firstChoices,
            currentStats,
            currentScore,
            blocks:normalizedBlocks,
            reason:null
        };
    }

    return {
        statsToState,
        stateToStats,
        applyAssignment,
        stateSignature,
        assignmentSignature,
        uniquePermutations,
        normalizeBlock,
        optionsForBlock,
        fairnessOfState,
        solveFuture,
        recommendScheduleHorizon
    };
});
