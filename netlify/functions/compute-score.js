// ─────────────────────────────────────────────────────────────────────────────
// GrowFitt Scoring Engine — server-side only
// This file never reaches the browser. All model logic lives here.
// ─────────────────────────────────────────────────────────────────────────────

// ── STAGE CLASSIFICATION ──────────────────────────────────────────────────────
const ARR_STAGE_MAP = [
  { key:'Early',  min:0,    max:10,       bgr:0.80 },
  { key:'Growth', min:10,   max:100,      bgr:0.55 },
  { key:'Scale',  min:100,  max:1000,     bgr:0.35 },
  { key:'Late',   min:1000, max:Infinity, bgr:0.25 },
];

function classifyStage(arrM) {
  for (const s of ARR_STAGE_MAP) {
    if (arrM >= s.min && arrM < s.max) return s;
  }
  return ARR_STAGE_MAP[3];
}

// ── LOOKUP ────────────────────────────────────────────────────────────────────
function lookup(val, table) {
  let score = table[0][1];
  for (let i = 0; i < table.length; i++) {
    if (val >= table[i][0]) score = table[i][1];
  }
  return score;
}

// ── SCORING ───────────────────────────────────────────────────────────────────
const COMPONENT_THRESHOLD = 3.0;
const ADJUSTMENT_FACTOR   = 0.92;

function computeScores(a) {
  const growth = parseFloat(a.growth_rate) / 100;
  const nrr    = parseFloat(a.nrr) / 100;
  const grr    = parseFloat(a.grr) / 100;
  const gm     = parseFloat(a.gm) / 100;
  const fcf    = parseFloat(a.fcf) / 100;
  const arrM   = parseFloat(a.arr_revenue || 10);

  const stage   = classifyStage(arrM);
  const bgr     = stage.bgr;
  const isEarly = stage.key === 'Early' || stage.key === 'Growth';

  // Growth outlier / laggard secondary check
  let growthFlag = null;
  if (growth > 1.5 * bgr) growthFlag = 'outlier';
  else if (growth < 0.5 * bgr) growthFlag = 'laggard';

  // GRS
  const GRS = lookup(growth, [[0,1],[0.1,2],[0.2,3],[0.3,4],[0.4,5]]);

  // SQS — derived from % inbound
  const inboundRaw = parseFloat(a.inbound_pct || 30) / 100;
  const SQS = lookup(inboundRaw, [[0,1],[0.15,2],[0.30,2],[0.45,3],[0.60,4],[1.0,5]]);

  // CQS — expansion ratio (70%) + deal quality (30%)
  const expansion = nrr - grr;
  const expansionScore = lookup(expansion, [[0,1],[0.05,2],[0.15,3],[0.25,4],[0.40,5]]);
  const dealQualityMap = {
    'Sharp decline recently':1, 'Material decline':2, 'Roughly the same':3,
    'Slight increase':4, 'Improving a lot':5
  };
  const dealScore = dealQualityMap[a.deal_quality] || 3;
  const CQS = 0.70 * expansionScore + 0.30 * dealScore;

  // GQS
  const GQS = 0.30 * GRS + 0.30 * SQS + 0.40 * CQS;

  // NRS — absolute NRR thresholds
  const NRS  = lookup(nrr, [[0,1],[0.90,1],[1.01,2],[1.05,3],[1.20,4],[1.60,5]]);
  const GRRS = lookup(grr, [[0,1],[0.80,2],[0.85,3],[0.90,4],[0.95,5]]);
  const cohortMap = {
    'Sharp decline recently':1, 'Material decline':2, 'Roughly the same':3,
    'Slight improvement':4, 'Improving significantly':5
  };
  const CSS = cohortMap[a.cohort_trend] || 3;
  const RS = 0.45 * NRS + 0.35 * GRRS + 0.20 * CSS;

  // ES — stage adaptive
  let ES, esFormula, esSubScores = {};
  if (isEarly) {
    const burnMultiple = parseFloat(a.burn_multiple || 2.0);
    const salesEff     = parseFloat(a.sales_efficiency || 1.0);
    const cacPayback   = parseFloat(a.cac_payback || 18);
    const BurnScore    = lookup(burnMultiple, [[0,5],[1.0,5],[1.5,4],[2.0,3],[2.5,2],[3.0,1]]);
    const SEScore      = lookup(salesEff,     [[0,1],[0.5,1],[0.9,2],[1.5,3],[3.0,4],[5.0,5]]);
    const CACScore     = lookup(cacPayback,   [[0,5],[6,5],[12,4],[18,3],[24,2],[36,1]]);
    const EBITDAScore  = lookup(fcf,          [[-0.5,1],[0.05,2],[0.15,3],[0.40,4],[0.60,5]]);
    ES = 0.30 * BurnScore + 0.25 * SEScore + 0.20 * CACScore + 0.25 * EBITDAScore;
    esFormula  = 'Early/Growth formula';
    esSubScores = { BurnScore, SEScore, CACScore, EBITDAScore };
  } else {
    const GM_Score  = lookup(gm,  [[0,1],[0.50,2],[0.60,3],[0.70,4],[0.80,5]]);
    const FCF_Score = lookup(fcf, [[-1,1],[0,2],[0.10,3],[0.20,4],[0.30,5]]);
    ES = 0.50 * GM_Score + 0.50 * FCF_Score;
    esFormula   = 'Scale/Late formula';
    esSubScores = { GM_Score, FCF_Score };
  }

  // Raw GFS
  const GFS = 0.30 * GQS + 0.40 * RS + 0.30 * ES;

  // Adjusted GFS — penalise each component below threshold
  const belowComponents = [];
  if (GQS < COMPONENT_THRESHOLD) belowComponents.push('Growth Quality');
  if (RS  < COMPONENT_THRESHOLD) belowComponents.push('Retention');
  if (ES  < COMPONENT_THRESHOLD) belowComponents.push('Efficiency');
  let adjGFS = GFS;
  belowComponents.forEach(() => { adjGFS = adjGFS * ADJUSTMENT_FACTOR; });
  const hasAdjustment = belowComponents.length > 0;

  // Mfit tiers (driven by adjGFS)
  let mfitLow, mfitHigh, interpretation;
  if      (adjGFS < 2.5) { mfitLow=0.5;  mfitHigh=0.7;   interpretation='Broken';  }
  else if (adjGFS < 3.0) { mfitLow=0.7;  mfitHigh=0.9;   interpretation='Fragile'; }
  else if (adjGFS < 3.8) { mfitLow=0.9;  mfitHigh=1.1;   interpretation='Average'; }
  else if (adjGFS < 4.5) { mfitLow=1.1;  mfitHigh=1.35;  interpretation='Strong';  }
  else                   { mfitLow=1.4;  mfitHigh=1.75;  interpretation='Elite';   }

  const OGR_Low  = bgr * mfitLow;
  const OGR_High = bgr * mfitHigh;
  const zone = growth < OGR_Low ? 'Under' : (growth <= OGR_High ? 'Fit' : 'Over');

  return {
    GFS, adjGFS, hasAdjustment, belowComponents,
    GQS, RS, ES, OGR_Low, OGR_High, zone, interpretation,
    NRS, GRRS, CSS, CQS, GRS, SQS, expansionScore, dealScore,
    growth, nrr, grr, gm, fcf, bgr, expansion,
    isEarly, esFormula, esSubScores,
    stageKey: stage.key, arrM, growthFlag
  };
}

// ── RECOMMENDATIONS ───────────────────────────────────────────────────────────
function getRecommendations(s) {
  const r = [];
  const sub = s.esSubScores || {};

  if (s.growthFlag === 'outlier')
    r.push(`Your growth rate of ${(s.growth*100).toFixed(0)}% is significantly above the ${Math.round(s.bgr*100)}% benchmark for your stage — flagged as an outlier. Validate the sustainability of this growth rate before committing further resources. Fast growth without system fitness leads to costly corrections.`);
  if (s.growthFlag === 'laggard')
    r.push(`Your growth rate of ${(s.growth*100).toFixed(0)}% is well below the ${Math.round(s.bgr*100)}% benchmark for your stage — flagged as a laggard. Identify the primary constraint: pipeline, conversion, capacity, or market positioning.`);
  if (s.SQS < 3)
    r.push('Inbound pull is weak. Growth is too dependent on outbound spend. Invest in content, community, and referral programmes to improve source quality and structurally reduce CAC.');
  else if (s.SQS < 4)
    r.push('Inbound mix is building but below best-in-class. Doubling inbound contribution from here would materially improve your GFS score and reduce go-to-market costs.');
  if (s.dealScore < 3)
    r.push('Deal quality is declining — a leading indicator of future NRR deterioration. Review ICP targeting, discount policies, and customer fit criteria before scaling acquisition spend.');
  if (s.CQS < 3)
    r.push('Expansion revenue is weak. Strengthening upsell and land-and-expand motions is the single highest-leverage move for your growth system — NRR improvement compounds over time.');
  if (s.GRS < 3)
    r.push('Growth rate is below stage benchmarks. Review pipeline generation and conversion rates — there may be positioning, capacity, or process constraints limiting top-line momentum.');
  if (s.NRS < 3)
    r.push('Net retention is below the threshold for efficient scaling. Investigate churn drivers through exit interviews and cohort analysis — fix this before accelerating acquisition spend.');
  if (s.GRRS < 3)
    r.push('Gross retention is deteriorating. Logo churn is eroding your base faster than you can fill it. Invest in customer success, onboarding quality, and health scoring urgently.');
  if (s.CSS < 3)
    r.push('Retention has worsened over the last 3 months versus your annual average — an early warning signal. Act now before this drift compounds into a structural forecasting problem.');
  if (s.isEarly) {
    if ((sub.BurnScore || 3) < 3)
      r.push('Burn multiple is high for your stage. Every dollar burned should generate proportional ARR. Review sales efficiency, headcount productivity, and discretionary spend.');
    if ((sub.SEScore || 3) < 3)
      r.push("Sales efficiency is below 1.0x — you're spending more to acquire revenue than you're generating. Review sales motion, territory design, ICP tightness, and conversion rates.");
    if ((sub.CACScore || 3) < 3)
      r.push('CAC payback is too long. Shortening it extends runway and improves investor confidence. Consider pricing architecture, sales cycle length, and higher-efficiency acquisition channels.');
  } else {
    if (s.gm < 0.65)
      r.push('Gross margin is below SaaS benchmarks. Review infrastructure costs, pricing architecture, and delivery efficiency — margin improvement here directly expands your OGR ceiling.');
    if (s.fcf < 0.05)
      r.push('Free cash flow is thin or negative. Align sales and marketing spend to sustainable payback periods and prioritise high-efficiency growth motions over volume.');
  }
  if (s.zone === 'Over')
    r.push('You are growing faster than your system can sustain. Consolidate operations — fix retention and efficiency first or you risk a system break that will be costly to reverse.');
  if (s.zone === 'Under')
    r.push('You have headroom to grow faster without straining the system. Identify whether the constraint is pipeline, conversion, or capacity — the system can absorb more growth.');
  if (r.length === 0)
    r.push('Your growth system is well-calibrated across all dimensions. Maintain this fitness as you scale and track your GFS quarterly to catch early drift before it becomes structural.');
  return r;
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let inputs;
  try {
    inputs = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Validate required fields
  const required = ['growth_rate','nrr','grr','gm','fcf','inbound_pct','deal_quality','cohort_trend','arr_revenue'];
  for (const field of required) {
    if (inputs[field] === undefined || inputs[field] === null || inputs[field] === '') {
      return { statusCode: 400, body: JSON.stringify({ error: `Missing field: ${field}` }) };
    }
  }

  try {
    const scores = computeScores(inputs);
    const recommendations = getRecommendations(scores);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        scores: {
          GFS:             scores.GFS,
          adjGFS:          scores.adjGFS,
          hasAdjustment:   scores.hasAdjustment,
          belowComponents: scores.belowComponents,
          GQS:             scores.GQS,
          RS:              scores.RS,
          ES:              scores.ES,
          OGR_Low:         scores.OGR_Low,
          OGR_High:        scores.OGR_High,
          zone:            scores.zone,
          interpretation:  scores.interpretation,
          growth:          scores.growth,
          nrr:             scores.nrr,
          grr:             scores.grr,
          gm:              scores.gm,
          fcf:             scores.fcf,
          expansion:       scores.expansion,
          isEarly:         scores.isEarly,
          esFormula:       scores.esFormula,
          stageKey:        scores.stageKey,
          arrM:            scores.arrM,
          growthFlag:      scores.growthFlag,
          GQSBelow:        scores.GQS < 3.0,
          RSBelow:         scores.RS  < 3.0,
          ESBelow:         scores.ES  < 3.0,
        },
        recommendations
      })
    };
  } catch (err) {
    console.error('Scoring error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Scoring failed', detail: err.message })
    };
  }
};
