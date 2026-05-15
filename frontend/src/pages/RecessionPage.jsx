import { useState, useEffect } from "react";
import { apiUrl, useAuthFetch } from "../lib/api";

// ── Math utilities ─────────────────────────────────────────────────────────────
function erf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1/(1+p*x);
  return sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));
}
function normalCDF(x) { return 0.5*(1+erf(x/Math.sqrt(2))); }

// ── Cox Proportional Hazards ───────────────────────────────────────────────────
// Baseline hazard h0(t) from historical avg expansion ~58 months
function coxHazard(t, spread, sahm, oilYoY, unempDelta, gdpGrowth) {
  const h0 = 1/58;
  const xb = (-0.55*spread) + (1.8*sahm) + (0.008*oilYoY) + (0.4*unempDelta) + (-0.15*gdpGrowth);
  return h0 * Math.exp(xb);
}

function survivalProb(t, spread, sahm, oilYoY, unempDelta, gdpGrowth) {
  return Math.exp(-coxHazard(t, spread, sahm, oilYoY, unempDelta, gdpGrowth) * t);
}

function cumulativeOnsetProb(t, spread, sahm, oilYoY, unempDelta, gdpGrowth) {
  return 1 - survivalProb(t, spread, sahm, oilYoY, unempDelta, gdpGrowth);
}

// ── Hamilton Regime-Switching ──────────────────────────────────────────────────
// p11 ≈ 1-1/58 (avg expansion), p22 ≈ 1-1/11 (avg recession ~11mo)
function regimeSwitching(spread, sahm, oilYoY, unempDelta, gdpGrowth) {
  const pressureScore = (-0.4*spread) + (1.2*sahm) + (0.005*oilYoY) + (0.3*unempDelta) + (-0.1*gdpGrowth);
  const baseP11 = 0.9828;
  const p11 = Math.max(0.5, Math.min(0.99, baseP11 - 0.05*pressureScore));
  const p22 = 0.9091;
  const pi_recession = (1-p11) / ((1-p11)+(1-p22));
  return { p11, p22, pi_recession, expectedExpansionDuration: 1/(1-p11) };
}

// ── Lag-Weighted Composite ─────────────────────────────────────────────────────
const INDICATORS = [
  { name: "Yield Curve",    peakLag: 15, weight: 0.30, key: "spread"     },
  { name: "Sahm Rule",      peakLag: 2,  weight: 0.20, key: "sahm"       },
  { name: "Oil Shock",      peakLag: 9,  weight: 0.20, key: "oilYoY"     },
  { name: "Unemployment Δ", peakLag: 4,  weight: 0.15, key: "unempDelta" },
  { name: "GDP Growth",     peakLag: 6,  weight: 0.15, key: "gdpGrowth"  },
];

function lagWeightedOnset(spread, sahm, oilYoY, unempDelta, gdpGrowth) {
  const signals = {
    spread:     Math.max(0, Math.min(1, (-spread + 2) / 4)),
    sahm:       Math.max(0, Math.min(1, sahm / 1.0)),
    oilYoY:     Math.max(0, Math.min(1, (oilYoY + 20) / 140)),
    unempDelta: Math.max(0, Math.min(1, unempDelta / 3)),
    gdpGrowth:  Math.max(0, Math.min(1, (-gdpGrowth + 5) / 10)),
  };
  let weightedLag = 0, totalWeight = 0;
  INDICATORS.forEach(ind => {
    const sig = signals[ind.key];
    weightedLag += ind.peakLag * ind.weight * sig;
    totalWeight += ind.weight * sig;
  });
  const expectedLag = totalWeight > 0.01 ? weightedLag / totalWeight : 18;
  const overallSignal = INDICATORS.reduce((s, ind) => s + ind.weight * signals[ind.key], 0);
  return { expectedLag, overallSignal, signals };
}

// ── Build timeline (0–24 months) ──────────────────────────────────────────────
function buildTimeline(spread, sahm, oilYoY, unempDelta, gdpGrowth) {
  const points = [];
  for (let t = 0; t <= 24; t++) {
    const cox = cumulativeOnsetProb(t, spread, sahm, oilYoY, unempDelta, gdpGrowth);
    const { expectedLag, overallSignal } = lagWeightedOnset(spread, sahm, oilYoY, unempDelta, gdpGrowth);
    const lagCDF = overallSignal * normalCDF((t - expectedLag) / 4);
    const { pi_recession } = regimeSwitching(spread, sahm, oilYoY, unempDelta, gdpGrowth);
    const ensemble = Math.min(0.98, 0.50*cox + 0.30*Math.max(0,lagCDF) + 0.20*Math.min(1, pi_recession*(t/12)));
    points.push({ t, cox: Math.min(0.98, cox), lagCDF: Math.max(0, Math.min(0.98, lagCDF)), ensemble });
  }
  return points;
}

// ── Colors ─────────────────────────────────────────────────────────────────────
const C = {
  bg:     "#05080f",
  panel:  "#080d17",
  border: "#111d2e",
  accent: "#0066ff",
  green:  "#00d98b",
  yellow: "#f0b429",
  orange: "#ff6b35",
  red:    "#ff2d55",
  muted:  "#6b93b8",
  dim:    "#162033",
  text:   "#8aaac8",
  bright: "#d0e4f4",
};

function riskColor(p) {
  if (p < 0.20) return C.green;
  if (p < 0.40) return C.yellow;
  if (p < 0.60) return C.orange;
  return C.red;
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────────
function TimelineChart({ data, hoveredMonth, setHoveredMonth }) {
  const W = 600, H = 220, PL = 44, PR = 12, PT = 16, PB = 36;
  const iW = W - PL - PR, iH = H - PT - PB;

  const xPos = t  => PL + (t / 24) * iW;
  const yPos = p  => PT + (1 - p) * iH;

  function makePath(key) {
    return data.map((d, i) => `${i===0?"M":"L"}${xPos(d.t).toFixed(1)},${yPos(d[key]).toFixed(1)}`).join(" ");
  }
  function makeArea(key) {
    const line = data.map(d => `L${xPos(d.t).toFixed(1)},${yPos(d[key]).toFixed(1)}`).join(" ");
    return `M${xPos(0)},${yPos(0)} ${line} L${xPos(24)},${yPos(0)} Z`;
  }

  const hovered = hoveredMonth !== null ? data[hoveredMonth] : null;
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
      onMouseLeave={() => setHoveredMonth(null)}>
      <defs>
        <linearGradient id="ensembleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0066ff" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#0066ff" stopOpacity="0.02"/>
        </linearGradient>
        <linearGradient id="coxGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d98b" stopOpacity="0.10"/>
          <stop offset="100%" stopColor="#00d98b" stopOpacity="0.01"/>
        </linearGradient>
        <filter id="lineglow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {yTicks.map(p => (
        <g key={p}>
          <line x1={PL} y1={yPos(p)} x2={W-PR} y2={yPos(p)} stroke={C.border} strokeWidth="1"/>
          <text x={PL-6} y={yPos(p)+4} textAnchor="end" fontSize="9"
            fill={C.muted} fontFamily="'IBM Plex Mono',monospace">{(p*100).toFixed(0)}%</text>
        </g>
      ))}

      {[0,3,6,9,12,15,18,21,24].map(t => (
        <text key={t} x={xPos(t)} y={H-8} textAnchor="middle" fontSize="9"
          fill={C.muted} fontFamily="'IBM Plex Mono',monospace">{t}mo</text>
      ))}

      <path d={makeArea("ensemble")} fill="url(#ensembleGrad)"/>
      <path d={makeArea("cox")} fill="url(#coxGrad)"/>

      <rect x={PL} y={yPos(1.0)} width={iW} height={yPos(0.6)-yPos(1.0)} fill="#ff2d5506"/>
      <rect x={PL} y={yPos(0.6)} width={iW} height={yPos(0.4)-yPos(0.6)} fill="#ff6b3504"/>
      <rect x={PL} y={yPos(0.4)} width={iW} height={yPos(0.2)-yPos(0.4)} fill="#f0b42903"/>

      <path d={makePath("cox")} fill="none" stroke={C.green} strokeWidth="1.5"
        strokeDasharray="4 3" opacity="0.6"/>
      <path d={makePath("lagCDF")} fill="none" stroke={C.yellow} strokeWidth="1.5"
        strokeDasharray="2 4" opacity="0.6"/>
      <path d={makePath("ensemble")} fill="none" stroke={C.accent} strokeWidth="2.5"
        filter="url(#lineglow)"/>

      {data.map((d, i) => (
        <rect key={i} x={xPos(d.t)-iW/48} y={PT} width={iW/24} height={iH}
          fill="transparent" onMouseEnter={() => setHoveredMonth(i)}/>
      ))}

      {hovered && (
        <g>
          <line x1={xPos(hovered.t)} y1={PT} x2={xPos(hovered.t)} y2={PT+iH}
            stroke="#ffffff18" strokeWidth="1"/>
          {["ensemble","cox","lagCDF"].map((k,i) => (
            <circle key={k} cx={xPos(hovered.t)} cy={yPos(hovered[k])} r="4"
              fill={[C.accent,C.green,C.yellow][i]} stroke={C.bg} strokeWidth="1.5"/>
          ))}
        </g>
      )}
    </svg>
  );
}

// ── Indicator signal bar ───────────────────────────────────────────────────────
function IndicatorRow({ name, peakLag, signal }) {
  const col = signal < 0.33 ? C.green : signal < 0.66 ? C.yellow : C.red;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 4 }}>
        <span style={{ fontSize:10, color:C.text, fontFamily:"'IBM Plex Mono',monospace" }}>{name}</span>
        <div style={{ display:"flex", gap:12 }}>
          <span style={{ fontSize:10, color:C.muted }}>peak lag {peakLag}mo</span>
          <span style={{ fontSize:10, color:col, fontWeight:700 }}>{(signal*100).toFixed(0)}%</span>
        </div>
      </div>
      <div style={{ height:4, background:C.dim, borderRadius:2 }}>
        <div style={{ height:"100%", width:`${signal*100}%`, background:col, borderRadius:2,
          boxShadow:`0 0 6px ${col}88`, transition:"width 0.3s ease, background 0.3s ease" }}/>
      </div>
    </div>
  );
}

// ── Slider ─────────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, unit, onChange, sigColor }) {
  const pct = ((value-min)/(max-min))*100;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ fontSize:10, color:C.text, fontFamily:"'IBM Plex Mono',monospace",
          textTransform:"uppercase", letterSpacing:1.5 }}>{label}</span>
        <span style={{ fontSize:11, color:sigColor, fontWeight:700,
          fontFamily:"'IBM Plex Mono',monospace" }}>{value}{unit}</span>
      </div>
      <div style={{ position:"relative", height:5, background:C.dim, borderRadius:3 }}>
        <div style={{ position:"absolute", left:0, width:`${pct}%`, height:"100%",
          background:sigColor, borderRadius:3, transition:"width 0.15s, background 0.3s" }}/>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ position:"absolute", top:-6, left:0, width:"100%", height:18,
            opacity:0, cursor:"pointer", zIndex:2 }}/>
        <div style={{ position:"absolute", left:`${pct}%`, top:"50%",
          transform:"translate(-50%,-50%)", width:12, height:12, borderRadius:"50%",
          background:sigColor, border:`2px solid ${C.bg}`,
          boxShadow:`0 0 8px ${sigColor}`, pointerEvents:"none",
          transition:"left 0.15s, background 0.3s" }}/>
      </div>
    </div>
  );
}

function normalizeSignal(name, val) {
  switch (name) {
    case "spread":     return Math.max(0, Math.min(1, (-val + 2) / 4));
    case "sahm":       return Math.max(0, Math.min(1, val / 1.0));
    case "oilYoY":     return Math.max(0, Math.min(1, (val + 20) / 140));
    case "unempDelta": return Math.max(0, Math.min(1, val / 3));
    case "gdpGrowth":  return Math.max(0, Math.min(1, (-val + 5) / 10));
    default:           return 0.5;
  }
}

function sigCol(name, val) {
  const sig = normalizeSignal(name, val);
  return sig < 0.33 ? C.green : sig < 0.66 ? C.yellow : C.red;
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function RecessionPage() {
  const [spread,       setSpread]       = useState(0.76);
  const [sahm,         setSahm]         = useState(0.43);
  const [oilYoY,       setOilYoY]       = useState(75);
  const [unempDelta,   setUnempDelta]   = useState(0.9);
  const [gdpGrowth,    setGdpGrowth]    = useState(2.0);
  const [hoveredMonth, setHoveredMonth] = useState(null);
  const [fetching,    setFetching]    = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null); // null | { ok: bool, msg: string }
  const authFetch = useAuthFetch();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleLoadCurrent(false); }, []);

  async function handleLoadCurrent(force = true) {
    setFetching(true);
    setFetchStatus(null);
    try {
      const res  = await authFetch(apiUrl(`/api/macro${force ? "?force=true" : ""}`));
      const json = await res.json();
      const d = json.data ?? {};
      if (d.spread      !== undefined) setSpread(d.spread);
      if (d.oilYoY      !== undefined) setOilYoY(d.oilYoY);
      if (d.sahm        !== undefined) setSahm(d.sahm);
      if (d.unempDelta  !== undefined) setUnempDelta(d.unempDelta);
      if (d.gdpGrowth   !== undefined) setGdpGrowth(d.gdpGrowth);
      if (Object.keys(d).length === 0) {
        setFetchStatus({ ok: false, msg: "No data returned — check backend logs" });
      } else {
        const LABELS = { spread: "SPREAD", oilYoY: "OIL", sahm: "SAHM", unempDelta: "UNEMP", gdpGrowth: "GDP" };
        const parts = Object.keys(LABELS)
          .filter(k => d[k] !== undefined)
          .map(k => LABELS[k]);
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const suffix = json.cached ? "CACHED" : ts;
        const failStr = (json.errors ?? [])
          .map(e => `✗ ${e.field.replace("_fetch_", "").toUpperCase()}: ${e.error}`)
          .join("  ");
        setFetchStatus({ ok: !failStr, msg: `${parts.join(" · ")} — ${suffix}  ${failStr}`.trim() });
      }
    } catch (err) {
      setFetchStatus({ ok: false, msg: String(err) });
    } finally {
      setFetching(false);
    }
  }

  const timeline = buildTimeline(spread, sahm, oilYoY, unempDelta, gdpGrowth);
  const { p11, p22, pi_recession, expectedExpansionDuration } = regimeSwitching(spread, sahm, oilYoY, unempDelta, gdpGrowth);
  const { expectedLag, overallSignal, signals } = lagWeightedOnset(spread, sahm, oilYoY, unempDelta, gdpGrowth);

  const p3  = timeline[3].ensemble;
  const p6  = timeline[6].ensemble;
  const p12 = timeline[12].ensemble;
  const p24 = timeline[24].ensemble;

  const hov = hoveredMonth !== null ? timeline[hoveredMonth] : null;

  let peakMonth = 1, peakSlope = 0;
  for (let i = 1; i < timeline.length; i++) {
    const slope = timeline[i].ensemble - timeline[i-1].ensemble;
    if (slope > peakSlope) { peakSlope = slope; peakMonth = i; }
  }

  const now = new Date();
  function monthLabel(offset) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset);
    return d.toLocaleString("default", { month:"short", year:"numeric" });
  }

  const baseDate = now.toLocaleString("default", { month:"long", year:"numeric" }).toUpperCase();

  return (
    <div style={{ background:C.bg, color:C.bright, fontFamily:"'IBM Plex Mono',monospace", borderRadius:8, paddingBottom:4 }}>

      {/* Page header */}
      <div style={{ background:C.panel, border:`1px solid ${C.border}`,
        borderRadius:8, padding:"18px 20px", marginBottom:16,
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:4, marginBottom:5 }}>
            MACRO RISK ENGINE · TIMING MODULE
          </div>
          <div style={{ fontSize:17, fontWeight:700, color:C.bright, letterSpacing:0.5 }}>
            RECESSION ONSET TIMING MODEL
          </div>
          <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
            Survival Analysis · Regime-Switching · Lag Distribution Ensemble
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:2, marginBottom:8 }}>BASE DATE</div>
          <div style={{ fontSize:13, color:C.accent, marginBottom:4 }}>{baseDate}</div>
          <div style={{ fontSize:9, color:C.muted, marginBottom:10 }}>24-MONTH HORIZON</div>
          <button onClick={handleLoadCurrent} disabled={fetching}
            style={{ background: fetching ? C.dim : C.accent, color: C.bright,
              border: "none", borderRadius:5, padding:"7px 14px", fontSize:9,
              fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1.5,
              cursor: fetching ? "default" : "pointer", opacity: fetching ? 0.7 : 1,
              transition:"background 0.2s, opacity 0.2s" }}>
            {fetching ? "FETCHING…" : "LOAD CURRENT DATA"}
          </button>
          {fetchStatus && (
            <div style={{ fontSize:9, marginTop:6,
              color: fetchStatus.ok ? C.green : C.red }}>
              {fetchStatus.ok ? "✓ " : "✗ "}{fetchStatus.msg}
            </div>
          )}
        </div>
      </div>

      {/* Key metrics row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
        {[
          { label:"3-Month Risk",  val:p3,  mo:3  },
          { label:"6-Month Risk",  val:p6,  mo:6  },
          { label:"12-Month Risk", val:p12, mo:12 },
          { label:"24-Month Risk", val:p24, mo:24 },
        ].map(({ label, val, mo }) => {
          const col = riskColor(val);
          return (
            <div key={mo} style={{ background:C.panel, border:`1px solid ${C.border}`,
              borderRadius:8, padding:"14px 16px",
              boxShadow: val > 0.4 ? `0 0 14px ${col}18` : "none" }}>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:2, marginBottom:8 }}>{label}</div>
              <div style={{ fontSize:24, fontWeight:700, color:col,
                transition:"color 0.4s" }}>{(val*100).toFixed(1)}%</div>
              <div style={{ fontSize:9, color:C.muted, marginTop:4 }}>{monthLabel(mo)}</div>
            </div>
          );
        })}
      </div>

      {/* Chart + hover tooltip */}
      <div style={{ background:C.panel, border:`1px solid ${C.border}`,
        borderRadius:8, padding:"20px 20px 8px", marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:3, marginBottom:4 }}>
              CUMULATIVE ONSET PROBABILITY — MONTHS FROM NOW
            </div>
            <div style={{ display:"flex", gap:20 }}>
              {[
                { col:C.accent, dash:"—",    label:"Ensemble (50% Cox + 30% Lag + 20% Regime)" },
                { col:C.green,  dash:"- - -", label:"Cox Proportional Hazards" },
                { col:C.yellow, dash:"··",    label:"Lag-Weighted Distribution" },
              ].map(({ col, dash, label }) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:12, color:col }}>{dash}</span>
                  <span style={{ fontSize:9, color:C.muted }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:C.dim, border:`1px solid ${C.border}`,
            borderRadius:6, padding:"10px 14px", minWidth:160,
            visibility: hov ? "visible" : "hidden" }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:2, marginBottom:8 }}>
              {hov ? `T+${hov.t} · ${monthLabel(hov.t)}` : "—"}
            </div>
            <div style={{ fontSize:10, color:C.accent, marginBottom:4 }}>
              Ensemble: {hov ? `${(hov.ensemble*100).toFixed(1)}%` : "—"}
            </div>
            <div style={{ fontSize:10, color:C.green, marginBottom:4 }}>
              Cox: {hov ? `${(hov.cox*100).toFixed(1)}%` : "—"}
            </div>
            <div style={{ fontSize:10, color:C.yellow }}>
              Lag: {hov ? `${(hov.lagCDF*100).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>
        <TimelineChart data={timeline} hoveredMonth={hoveredMonth} setHoveredMonth={setHoveredMonth}/>
      </div>

      {/* Two-column: regime + lag indicators */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, padding:"18px 20px" }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:3, marginBottom:16 }}>
            HAMILTON REGIME-SWITCHING
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            {[
              { label:"Steady-state recession",  val:pi_recession,              fmt: v => (v*100).toFixed(1)+"%",  color: riskColor(pi_recession) },
              { label:"Expected expansion",       val:expectedExpansionDuration, fmt: v => v.toFixed(1)+" mo",      color: C.accent               },
              { label:"Avg recession duration",   val:1/(1-p22),                 fmt: v => v.toFixed(1)+" mo",      color: C.text                 },
              { label:"Monthly onset risk",       val:(1-p11)*100,               fmt: v => v.toFixed(2)+"%",        color: riskColor(1-p11)       },
            ].map(({ label, val, fmt, color }) => (
              <div key={label} style={{ background:C.dim, borderRadius:6, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:C.muted, marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:14, fontWeight:700, color }}>{fmt(val)}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:2, marginBottom:8 }}>TRANSITION MATRIX</div>
            <div style={{ fontSize:10, color:C.text, lineHeight:1.8 }}>
              <div>Expansion → Expansion: <span style={{ color:C.green }}>{(p11*100).toFixed(2)}%</span></div>
              <div>Expansion → Recession: <span style={{ color:C.red }}>{((1-p11)*100).toFixed(2)}%</span></div>
              <div>Recession → Recession: <span style={{ color:C.yellow }}>{(p22*100).toFixed(2)}%</span></div>
              <div>Recession → Expansion: <span style={{ color:C.green }}>{((1-p22)*100).toFixed(2)}%</span></div>
            </div>
          </div>
        </div>

        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, padding:"18px 20px" }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:3, marginBottom:6 }}>
            LAG-WEIGHTED INDICATOR SIGNALS
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, color:C.muted, marginBottom:4 }}>Composite expected onset lag</div>
            <div style={{ fontSize:22, fontWeight:700, color:riskColor(overallSignal) }}>
              {expectedLag.toFixed(1)} months
            </div>
            <div style={{ fontSize:10, color:C.muted }}>≈ {monthLabel(Math.round(expectedLag))}</div>
          </div>
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
            {INDICATORS.map(ind => (
              <IndicatorRow key={ind.name} name={ind.name} peakLag={ind.peakLag}
                signal={signals[ind.key]}/>
            ))}
          </div>
        </div>
      </div>

      {/* Peak risk callout */}
      <div style={{ background:C.dim, border:`1px solid ${riskColor(p12)}44`,
        borderRadius:8, padding:"16px 20px",
        boxShadow:`0 0 20px ${riskColor(p12)}10` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:3, marginBottom:6 }}>
              ENSEMBLE ASSESSMENT · {baseDate}
            </div>
            <div style={{ fontSize:13, color:C.bright, lineHeight:1.8 }}>
              Peak onset risk window:{" "}
              <span style={{ color:riskColor(p12), fontWeight:700 }}>
                {monthLabel(peakMonth-1)} – {monthLabel(peakMonth+2)}
              </span>
              <br/>
              12-month cumulative probability:{" "}
              <span style={{ color:riskColor(p12), fontWeight:700 }}>
                {(p12*100).toFixed(1)}%
              </span>
              <br/>
              Regime-implied expansion duration:{" "}
              <span style={{ color:C.accent, fontWeight:700 }}>
                {expectedExpansionDuration.toFixed(0)} months remaining (conditional)
              </span>
            </div>
          </div>
          <div style={{ textAlign:"right", minWidth:100 }}>
            <div style={{ fontSize:9, color:C.muted, marginBottom:4 }}>OVERALL SIGNAL</div>
            <div style={{ fontSize:32, fontWeight:700, color:riskColor(overallSignal) }}>
              {(overallSignal*100).toFixed(0)}
            </div>
            <div style={{ fontSize:9, color:C.muted }}>/100</div>
          </div>
        </div>
      </div>

      {/* Scenario sliders */}
      <div style={{ background:C.panel, border:`1px solid ${C.border}`,
        borderRadius:8, padding:"20px 22px", marginTop:14 }}>
        <div style={{ fontSize:9, color:C.muted, letterSpacing:3, marginBottom:18 }}>
          SCENARIO INPUTS — DRAG TO STRESS-TEST
        </div>
        <div>
          <Slider label="Yield Spread (10Y−3M)" value={spread} min={-2} max={3} step={0.01}
            unit="pp" onChange={setSpread} sigColor={sigCol("spread",spread)}/>
          <Slider label="Sahm Rule" value={sahm} min={0} max={1} step={0.01}
            unit="" onChange={setSahm} sigColor={sigCol("sahm",sahm)}/>
          <Slider label="Oil YoY %" value={oilYoY} min={-60} max={120} step={1}
            unit="%" onChange={setOilYoY} sigColor={sigCol("oilYoY",oilYoY)}/>
          <Slider label="Unemployment Δ" value={unempDelta} min={-0.5} max={3} step={0.1}
            unit="pp" onChange={setUnempDelta} sigColor={sigCol("unempDelta",unempDelta)}/>
          <Slider label="GDP Growth" value={gdpGrowth} min={-5} max={6} step={0.1}
            unit="%" onChange={setGdpGrowth} sigColor={sigCol("gdpGrowth",gdpGrowth)}/>
        </div>
      </div>

      <div style={{ marginTop:14, fontSize:9, color:"#3a5878", lineHeight:1.9 }}>
        METHODOLOGY: Cox hazard uses h₀=1/58mo baseline (historical avg expansion) scaled by exp(Xβ).
        Regime-switching transition probs adjusted from historical p11=0.9828, p22=0.9091.
        Lag distribution peaks estimated from NBER recession lead-time literature.
        Ensemble weights: 50% Cox survival · 30% lag-weighted CDF · 20% regime steady-state.
        Coefficients are illustrative; production use requires MLE calibration on USREC/FRED data.
      </div>
    </div>
  );
}
