(function (root, factory) {
    'use strict';
    const Engine = factory();
    if (typeof module === 'object' && module.exports) module.exports = Engine;
    else root.VectorSchedulingEngine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CREDIT_CATEGORIES = ['Firefighter', 'Swing', 'Tiller', 'TADE'];
    const CREDIT_DETAIL_MAP = Object.freeze({
        'Firefighter': 'Firefighter',
        'FF Sub': 'Firefighter',
        'Swing': 'Swing',
        'Swing/FF': 'Swing',
        'Swing Sub': 'Swing',
        'Tiller': 'Tiller',
        'TADE': 'TADE'
    });

    function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
    function normalizeKey(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
    function normalizeCredit(detail) { return CREDIT_DETAIL_MAP[clean(detail)] || null; }
    function isOffLikeText(text) { return /(vacation pay|holiday pay|personal sick|sick|paid leave|time off|jury|fmla|workers comp|bereavement)/i.test(clean(text)); }
    function isTruckAssignment(text, apparatusName) { const s=clean(text).toLowerCase(), a=clean(apparatusName).toLowerCase(); return !!a && s.includes(a); }
    function isWorkingElsewhere(text, apparatusName) {
        const s=clean(text); if (!s || isOffLikeText(s) || isTruckAssignment(s, apparatusName)) return false;
        return /\b(Engine|Medic|Truck|Battalion|Deployment|Training|Additional Hours|Support Services|Prevention|Command Staff)\b/i.test(s);
    }

    function historyInWindow(history, startDate, endDate) {
        return (history || []).filter(row => {
            if (!row?.date) return true;
            if (startDate && String(row.date) <= String(startDate)) return false;
            if (endDate && String(row.date) >= String(endDate)) return false;
            return true;
        });
    }

    function statsFromHistory(history, firefighterIds, startDate=null, endDate=null) {
        const out={};
        for (const id of firefighterIds) {
            const counts=Object.fromEntries(CREDIT_CATEGORIES.map(c=>[c,0])); let total=0;
            for (const row of historyInWindow(history,startDate,endDate)) {
                if (row.personId !== id || row.verified === false) continue;
                const credit=row.credit || normalizeCredit(row.detail);
                if (!credit || !Object.prototype.hasOwnProperty.call(counts,credit)) continue;
                counts[credit]++; total++;
            }
            const ratios={}; for (const c of CREDIT_CATEGORIES) ratios[c]=total ? counts[c]/total : 0;
            out[id]={counts,total,ratios};
        }
        return out;
    }

    function fairnessScore(stats, firefighterIds) {
        let score=0;
        for (const category of CREDIT_CATEGORIES) {
            const ratios=firefighterIds.map(id=>stats[id]?.ratios?.[category] || 0);
            for (let i=0;i<ratios.length;i++) for (let j=i+1;j<ratios.length;j++) { const d=ratios[i]-ratios[j]; score+=d*d; }
        }
        return score;
    }

    function projectedStats(history, firefighterIds, assignmentByPerson, startDate=null, endDate=null, repeatCount=1) {
        const synthetic=[...(history || [])]; const n=Math.max(1,Number(repeatCount)||1);
        for (let i=0;i<n;i++) for (const [personId,credit] of Object.entries(assignmentByPerson || {})) if (credit) synthetic.push({personId,credit,verified:true,source:'projection'});
        return statsFromHistory(synthetic,firefighterIds,startDate,endDate);
    }

    function permutations(items) {
        if (items.length<=1) return [items.slice()]; const out=[];
        for (let i=0;i<items.length;i++) { const head=items[i], rest=items.slice(0,i).concat(items.slice(i+1)); for (const tail of permutations(rest)) out.push([head,...tail]); }
        return out;
    }

    function roleSetForScenario(scenario, availableCount) {
        if (availableCount<2) return [];
        if (scenario==='tade-required') return availableCount>=3 ? ['Firefighter','Tiller','TADE'] : ['Tiller','TADE'];
        return availableCount>=3 ? ['Firefighter','Tiller','Swing'] : ['Firefighter','Tiller'];
    }

    function recommendAssignments({history,firefighterIds,availableIds,scenario='normal',limit=3,startDate=null,endDate=null,repeatCount=1}) {
        const ids=(availableIds || []).filter(id=>firefighterIds.includes(id)); const roles=roleSetForScenario(scenario,ids.length);
        if (!roles.length || roles.length!==ids.length) return {recommendations:[],reason:ids.length<2?'At least two available firefighters are required for automatic recommendation.':'Unable to derive a complete role set.'};
        const currentStats=statsFromHistory(history,firefighterIds,startDate,endDate); const currentScore=fairnessScore(currentStats,firefighterIds);
        const recommendations=permutations(roles).map(roleOrder=>{
            const assignmentByPerson={}; ids.forEach((id,index)=>{assignmentByPerson[id]=roleOrder[index];});
            const stats=projectedStats(history,firefighterIds,assignmentByPerson,startDate,endDate,repeatCount); const score=fairnessScore(stats,firefighterIds);
            return {assignmentByPerson,stats,score,improvement:currentScore-score};
        }).sort((a,b)=>a.score-b.score || b.improvement-a.improvement);
        return {recommendations:recommendations.slice(0,Math.max(1,limit)),currentScore};
    }

    function detectDutyCode(text) {
        const s=clean(text); const patterns=[['TABC',/\bTABC\b/i],['TAFIT',/\bTAFIT\b/i],['TADE',/\bTADE\b/i],['TAC',/\bTAC\b/i],['DE-A',/\bDE-A\b/i],['Capt',/\bCapt\b/i],['FFB',/\bFFB\b/i],['TM',/\bTM\b/i],['Swing',/\bSWING\b/i]];
        for (const [code,rx] of patterns) if (rx.test(s)) return code; return null;
    }

    function detectAssignment(text) {
        const s=clean(text); const patterns=[/\bTruck\s+\d{3}\b/i,/\bEngine\s+\d{3}\b/i,/\bMedic\s+\d{3}\b/i,/\bBattalion\s+\d{3}\b/i,/\bDEPLOYMENT\b/i,/\bDeployment\b/i,/\bOvertime Sign Up\b/i,/\bTraining\s*\/\s*Additional Hours\b/i,/\bSupport Services\b/i,/\bPrevention\b/i,/\bCommand Staff\b/i];
        for (const rx of patterns) { const m=s.match(rx); if (m) return m[0]; }
        if (isOffLikeText(s)) { const m=s.match(/Vacation Pay|Holiday Pay|Personal Sick|Paid Leave|Time Off|Sick|FMLA/i); return m?m[0]:'Off'; }
        return null;
    }

    function reconcileFirefighter({planCredit,observation,apparatusName}) {
        const raw=clean(observation?.rawText || ''); const duty=observation?.dutyCode || detectDutyCode(raw); const assignment=observation?.assignment || detectAssignment(raw);
        const onTruck=isTruckAssignment(assignment || raw,apparatusName); const offLike=isOffLikeText(raw || assignment);
        if (offLike) return {status:planCredit?'exception':'observed-off',detail:assignment||'Off',credit:null,reason:'Observed as time off / unavailable.'};
        if (planCredit==='Swing') {
            if (onTruck && (/^FFB$/i.test(duty||'') || /\bFirefighter\b/i.test(raw))) return {status:'verified',detail:'Swing/FF',credit:'Swing',reason:'Planned Swing; remained on apparatus as firefighter.'};
            if (!onTruck && isWorkingElsewhere(assignment||raw,apparatusName)) return {status:'verified',detail:'Swing',credit:'Swing',reason:'Planned Swing; observed working away from home apparatus.'};
            if (/\bSWING\b/i.test(raw) || duty==='Swing') return {status:'verified',detail:'Swing',credit:'Swing',reason:'Observed Swing duty.'};
            return {status:'needs-review',detail:assignment||duty||'Unknown',credit:null,reason:'Planned Swing could not be confirmed from the Vector record.'};
        }
        if (planCredit==='Tiller') {
            if (duty==='TM' || /\bTiller\b/i.test(raw)) return {status:'verified',detail:'Tiller',credit:'Tiller',reason:'Observed tiller duty.'};
            return {status:'needs-review',detail:assignment||duty||'Unknown',credit:null,reason:'Planned Tiller did not match visible duty.'};
        }
        if (planCredit==='TADE') {
            if (duty==='DE-A' || duty==='TADE' || /\bTADE\b/i.test(raw)) return {status:'verified',detail:'TADE',credit:'TADE',reason:'Observed acting driver/engineer duty.'};
            return {status:'needs-review',detail:assignment||duty||'Unknown',credit:null,reason:'Planned TADE did not match visible duty.'};
        }
        if (planCredit==='Firefighter') {
            if (onTruck && (duty==='FFB' || /\bFirefighter\b/i.test(raw))) return {status:'verified',detail:'Firefighter',credit:'Firefighter',reason:'Observed firefighter duty on home apparatus.'};
            return {status:'needs-review',detail:assignment||duty||'Unknown',credit:null,reason:'Planned Firefighter did not match visible duty.'};
        }
        if (duty==='TM' || /\bTiller\b/i.test(raw)) return {status:'inferred',detail:'Tiller',credit:'Tiller',reason:'Tiller is directly visible.'};
        if (duty==='DE-A' || duty==='TADE' || /\bTADE\b/i.test(raw)) return {status:'inferred',detail:'TADE',credit:'TADE',reason:'Acting driver/engineer duty is directly visible.'};
        if (onTruck && (duty==='FFB' || /\bFirefighter\b/i.test(raw))) return {status:'needs-review',detail:'Firefighter or Swing/FF',credit:null,reason:'Without the pre-shift plan, a home-apparatus firefighter may be true Firefighter or Swing/FF.'};
        if (!onTruck && isWorkingElsewhere(assignment||raw,apparatusName)) return {status:'needs-review',detail:assignment||'Working elsewhere',credit:null,reason:'Without the pre-shift plan, a move away from the apparatus cannot safely be classified as Swing.'};
        return {status:'needs-review',detail:assignment||duty||'Unknown',credit:null,reason:'No unambiguous rotation outcome detected.'};
    }

    function detectShiftFromText(text) { const m=clean(text).match(/\b([ABC])\s+Shift\s+Day\s+([12])\b/i); return m?`${m[1].toUpperCase()} Shift Day ${m[2]}`:null; }
    function parseDateFromText(text) {
        const s=clean(text); const longDate=s.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i);
        if (longDate) { const parsed=new Date(`${longDate[1]} ${longDate[2]}, ${longDate[3]} 12:00:00`); if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10); }
        const shortDate=s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/); if (shortDate) return `${shortDate[3]}-${String(shortDate[1]).padStart(2,'0')}-${String(shortDate[2]).padStart(2,'0')}`; return null;
    }

    return {CREDIT_CATEGORIES,CREDIT_DETAIL_MAP,clean,normalizeKey,normalizeCredit,historyInWindow,statsFromHistory,fairnessScore,projectedStats,permutations,roleSetForScenario,recommendAssignments,detectDutyCode,detectAssignment,detectShiftFromText,parseDateFromText,reconcileFirefighter,isOffLikeText,isTruckAssignment,isWorkingElsewhere};
});
