import { useState, useMemo, useRef } from "react";

const C = {
  navy:       "#1B2A4A",
  navy2:      "#253D6B",
  gold:       "#C8A84B",
  goldLight:  "#F5E9C0",
  offWhite:   "#F8F6F0",
  lightGray:  "#E8E4DC",
  gray:       "#6B7280",
  green:      "#2E6B3E",
  greenLight: "#D4EDDA",
  red:        "#B82424",
  redLight:   "#FDEAEA",
  amber:      "#C77B0D",
  amberLight: "#FEF3DC",
  white:      "#FFFFFF",
  htext:      "#8BA0C0",
};

const fmt = (n, decimals = 2) =>
  n === null || n === undefined || isNaN(n) ? "—" : "$" + Number(n).toFixed(decimals);

const parse = (v) => {
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};

const CONCESSION_TYPES = [
  { key: "paymentTerms",   label: "Payment Terms Extension",   placeholder: "Days extension, e.g. 30",      unit: "days",   hint: "Additional days of payment terms you could offer. e.g. moving from Net 30 to Net 60 = 30 days." },
  { key: "volumeCommit",   label: "Volume Commitment",         placeholder: "% volume increase, e.g. 10",   unit: "%",      hint: "Percentage increase in committed annual volume. Higher volume reduces supplier unit cost." },
  { key: "contractLength", label: "Contract Length Extension", placeholder: "Additional months, e.g. 12",   unit: "months", hint: "Additional months of contract term. Longer term reduces supplier customer acquisition risk." },
  { key: "specFlex",       label: "Specification Flexibility", placeholder: "Est. cost reduction to supplier, e.g. 2", unit: "%", hint: "Estimated % cost reduction to supplier from specification relaxation or standardization." },
];

export default function NegotiationWorksheet() {
  const [activeTab, setActiveTab]         = useState("position");
  const [supplierName, setSupplierName]   = useState("");
  const [category, setCategory]           = useState("");
  const [annualVolume, setAnnualVolume]   = useState("");
  const [currentPrice, setCurrentPrice]   = useState("");
  const [marketBenchmark, setMarketBenchmark] = useState("");
  const [shouldCost, setShouldCost]       = useState("");
  const [targetPrice, setTargetPrice]     = useState("");
  const [walkawayPrice, setWalkawayPrice] = useState("");
  const [batnaAltPrice, setBatnaAltPrice] = useState("");
  const [batnaQualCost, setBatnaQualCost] = useState("");
  const [batnaTransCost, setBatnaTransCost] = useState("");
  const [concessions, setConcessions]     = useState({ paymentTerms: "", volumeCommit: "", contractLength: "", specFlex: "" });
  const [wacc, setWacc]                   = useState("10");
  const [openHint, setOpenHint]           = useState(null);

  const vol    = parse(annualVolume);
  const curr   = parse(currentPrice);
  const bench  = parse(marketBenchmark);
  const sc     = parse(shouldCost);
  const tgt    = parse(targetPrice);
  const walk   = parse(walkawayPrice);
  const altP   = parse(batnaAltPrice);
  const qualC  = parse(batnaQualCost);
  const transC = parse(batnaTransCost);
  const waccN  = (parse(wacc) || 10) / 100;

  // ── Opening position: must be BELOW target (lower = better for buyer) ──
  const openingPosition = useMemo(() => {
    if (!tgt) return null;
    // Open halfway between should-cost and target if SC exists, else 10% below target
    let opening = sc ? (sc + tgt) / 2 : tgt * 0.90;
    // Floor: never go below should-cost
    if (sc && opening < sc) opening = sc;
    // Cap: never open above market benchmark
    if (bench && opening > bench) opening = bench;
    // Cap: never open at or above target -- opening must always be more aggressive
    if (opening >= tgt) opening = tgt * 0.97;
    return opening;
  }, [tgt, sc, bench]);

  const gapToOpen   = curr && openingPosition ? curr - openingPosition : null;
  const gapToTarget = curr && tgt  ? curr - tgt  : null;
  const gapToBench  = curr && bench ? curr - bench : null;
  const gapToSC     = curr && sc   ? curr - sc   : null;

  const annualSavingsAtTarget = vol && curr && tgt  ? vol * (curr - tgt)  : null;

  // ── BATNA ──
  const batnaValue = useMemo(() => {
    if (!altP || !curr || !vol) return null;
    const priceDiff    = (altP - curr) * vol; // positive = alt more expensive
    const oneTimeCosts = (qualC || 0) + (transC || 0);
    const breakeven    = priceDiff > 0 && oneTimeCosts > 0 ? oneTimeCosts / (priceDiff / 12) : null;
    return { priceDiff, oneTimeCosts, breakeven };
  }, [altP, curr, vol, qualC, transC]);

  // ── Concession values ──
  const concessionValues = useMemo(() => {
    const spend = vol && curr ? vol * curr : null;
    const ptDays  = parse(concessions.paymentTerms);
    const volPct  = parse(concessions.volumeCommit);
    const months  = parse(concessions.contractLength);
    const specPct = parse(concessions.specFlex);
    return {
      paymentTerms:   spend && ptDays  ? spend * waccN * (ptDays / 365)    : null,
      volumeCommit:   spend && volPct  ? spend * (volPct / 100) * 0.15     : null,
      contractLength: spend && months  ? spend * (months / 12) * 0.05      : null,
      specFlex:       spend && specPct ? spend * (specPct / 100)            : null,
    };
  }, [concessions, vol, curr, waccN]);

  const concessionSequence = useMemo(() =>
    CONCESSION_TYPES
      .map(c => ({ ...c, value: concessionValues[c.key], input: concessions[c.key] }))
      .filter(c => c.value !== null && c.value > 0)
      .sort((a, b) => a.value - b.value),
  [concessionValues, concessions]);

  const briefRef = useRef(null);

  const downloadPDF = async () => {
    if (!briefRef.current) return;
    const { default: html2canvas } = await import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js");
    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.esm.min.js");
    const canvas = await html2canvas(briefRef.current, { scale: 2, useCORS: true, backgroundColor: "#F8F6F0" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 20;
    const imgH = (canvas.height * imgW) / canvas.width;
    let yPos = 10;
    let remaining = imgH;
    while (remaining > 0) {
      pdf.addImage(imgData, "PNG", 10, yPos, imgW, imgH);
      remaining -= (pageH - 20);
      if (remaining > 0) { pdf.addPage(); yPos = 10 - (imgH - remaining); }
    }
    const name = supplierName ? `negotiation-brief-${supplierName.replace(/\s+/g, "-").toLowerCase()}.pdf` : "negotiation-brief.pdf";
    pdf.save(name);
  };

  const hasPositionData  = !!(curr && tgt);
  const hasBatnaData     = !!(altP && curr && vol);
  const hasConcessionData = concessionSequence.length > 0;

  // Price ladder points sorted low to high
  const ladderPoints = [
    { label: "Should-Cost",      val: sc,              color: C.red   },
    { label: "Opening Position", val: openingPosition, color: C.navy  },
    { label: "Market Benchmark", val: bench,           color: "#1A5C6B" },
    { label: "Target",           val: tgt,             color: C.green },
    { label: "Walkaway",         val: walk,            color: C.amber },
    { label: "Current Price",    val: curr,            color: C.gray  },
  ].filter(p => p.val !== null).sort((a, b) => a.val - b.val);

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: C.offWhite, minHeight: "100vh", color: C.navy }}>

      {/* Header */}
      <div style={{ background: C.navy, borderBottom: `3px solid ${C.gold}`, padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: "bold", color: C.white, letterSpacing: 1 }}>NEGOTIATION</span>
          <span style={{ fontSize: 10, color: C.gold, fontFamily: "sans-serif", letterSpacing: 2, fontWeight: "bold" }}>PREPARATION WORKSHEET</span>
        </div>
        <div style={{ fontSize: 10, color: C.htext, marginTop: 3, fontFamily: "sans-serif" }}>
          Matthew Flanagan, CPSM · Flanagan Sourcing Intelligence Portfolio
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: C.navy2, borderBottom: `2px solid ${C.gold}`, overflowX: "auto" }}>
        <div style={{ display: "flex", minWidth: "max-content" }}>
          {[
            { key: "position",    label: "1. Position" },
            { key: "batna",       label: "2. BATNA" },
            { key: "concessions", label: "3. Concessions" },
            { key: "brief",       label: "4. Brief" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              background: activeTab === tab.key ? C.gold : "transparent",
              color: activeTab === tab.key ? C.navy : C.htext,
              border: "none", padding: "10px 16px", fontSize: 12,
              fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 1,
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 48px", maxWidth: 800, margin: "0 auto" }}>

        {/* ── POSITION ── */}
        {activeTab === "position" && (
          <div>
            <InfoBox>
              Enter your pricing inputs below. The calculator sets your opening position below your target — in price negotiations, lower is better for the buyer. Your opening should be more aggressive than your target so you have room to move.
            </InfoBox>

            <Card title="Negotiation Context" subtitle="Supplier, category, and volume.">
              <Col>
                <Field label="Supplier Name"><input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. Apex Precision" style={inputSt} /></Field>
                <Field label="Category / Item"><input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Precision Housing Assembly" style={inputSt} /></Field>
                <Field label="Annual Volume (units)"><input type="number" min={0} value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} placeholder="e.g. 14400" style={inputSt} /></Field>
              </Col>
            </Card>

            <Card title="Pricing Inputs" subtitle="All prices are per unit. Lower = better for buyer.">
              <Col>
                {[
                  { label: "Current Price",       val: currentPrice,    set: setCurrentPrice,    hint: "The current price you are paying per unit.", key: "h_curr" },
                  { label: "Market Benchmark",    val: marketBenchmark, set: setMarketBenchmark, hint: "Competitive market price from RFQ data, industry benchmarks, or comparable bids.", key: "h_bench" },
                  { label: "Should-Cost Estimate",val: shouldCost,      set: setShouldCost,      hint: "Your bottom-up estimate of what this part should cost to produce. Used as the floor for your opening position.", key: "h_sc" },
                  { label: "Target Price",        val: targetPrice,     set: setTargetPrice,     hint: "The price you are trying to achieve. Realistic and defensible. Your opening will be set below this.", key: "h_tgt" },
                  { label: "Walkaway Price",      val: walkawayPrice,   set: setWalkawayPrice,   hint: "The maximum price you will accept. For cost reductions this is at or below current price.", key: "h_walk" },
                ].map(row => (
                  <div key={row.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <FieldLabel>{row.label}</FieldLabel>
                      <HintBtn k={row.key} open={openHint} set={setOpenHint} />
                    </div>
                    {openHint === row.key && <HintBox>{row.hint}</HintBox>}
                    <DollarInput val={row.val} set={row.set} />
                  </div>
                ))}
              </Col>
            </Card>

            {hasPositionData && (
              <>
                {/* Opening position result */}
                <div style={{ background: C.navy, border: `2px solid ${C.gold}`, borderRadius: 6, padding: "16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: C.gold, fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 2, marginBottom: 10 }}>CALCULATED POSITIONS</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { label: "OPEN WITH", val: openingPosition, color: C.gold },
                      { label: "TARGET",    val: tgt,             color: "#6EE89A" },
                      { label: "WALKAWAY",  val: walk,            color: "#FCD34D" },
                      { label: "CURRENT",   val: curr,            color: C.htext },
                    ].filter(p => p.val !== null).map((p, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 70, textAlign: "center", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "10px 6px" }}>
                        <div style={{ fontSize: 9, color: C.htext, fontFamily: "sans-serif", letterSpacing: 1, marginBottom: 4 }}>{p.label}</div>
                        <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "sans-serif", color: p.color }}>{fmt(p.val)}</div>
                      </div>
                    ))}
                  </div>
                  {openingPosition && tgt && openingPosition < tgt && (
                    <div style={{ marginTop: 10, fontSize: 11, color: "#6EE89A", fontFamily: "sans-serif", borderTop: "1px solid rgba(200,168,75,0.3)", paddingTop: 10 }}>
                      ✓ Opening {fmt(openingPosition)} is below target {fmt(tgt)} — correct direction. Room to move: {fmt(tgt - openingPosition)} per unit.
                    </div>
                  )}
                </div>

                {/* Gap analysis */}
                <Card title="Gap Analysis" subtitle="Distance from current price to each price point. Positive = supplier needs to come down.">
                  <Col>
                    {[
                      { label: "Current → Opening Position", gap: gapToOpen,   desc: "How far supplier must move to reach your opening ask" },
                      { label: "Current → Target",           gap: gapToTarget, desc: "How far supplier must move to reach your goal" },
                      { label: "Current → Market Benchmark", gap: gapToBench,  desc: "How far current price is above the competitive market" },
                      { label: "Current → Should-Cost",      gap: gapToSC,     desc: "Total gap between current price and cost-based floor" },
                    ].filter(r => r.gap !== null).map((row, idx, arr) => (
                      <div key={idx} style={{ paddingBottom: idx < arr.length - 1 ? 12 : 0, marginBottom: idx < arr.length - 1 ? 12 : 0, borderBottom: idx < arr.length - 1 ? `1px solid ${C.lightGray}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontFamily: "sans-serif", color: C.navy, fontWeight: "bold" }}>{row.label}</span>
                          <span style={{ fontSize: 16, fontWeight: "bold", fontFamily: "sans-serif", color: row.gap > 0 ? C.green : C.amber }}>
                            {row.gap > 0 ? "-" : "+"}{fmt(Math.abs(row.gap))}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif", marginBottom: 4 }}>{row.desc}</div>
                        {vol && <div style={{ fontSize: 11, fontFamily: "sans-serif", color: row.gap > 0 ? C.green : C.amber, fontWeight: "bold" }}>Annual: {row.gap > 0 ? "saves" : "costs"} {fmt(Math.abs(row.gap * vol), 0)} / year at {vol.toLocaleString()} units</div>}
                      </div>
                    ))}
                  </Col>
                </Card>

                {/* Price ladder */}
                {ladderPoints.length >= 2 && (
                  <Card title="Price Ladder" subtitle="All price points from lowest to highest. Your opening should be near the bottom.">
                    <div style={{ padding: "8px 0" }}>
                      {ladderPoints.map((p, idx) => {
                        const minVal = ladderPoints[0].val;
                        const maxVal = ladderPoints[ladderPoints.length - 1].val;
                        const range = maxVal - minVal || 1;
                        const pct = ((p.val - minVal) / range) * 80;
                        return (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 96, textAlign: "right", fontSize: 11, fontFamily: "sans-serif", color: p.color, fontWeight: "bold", flexShrink: 0 }}>{p.label}</div>
                            <div style={{ flex: 1, height: 4, background: C.lightGray, borderRadius: 2, position: "relative" }}>
                              <div style={{ position: "absolute", left: `${pct}%`, top: "50%", transform: "translate(-50%, -50%)", width: 12, height: 12, borderRadius: "50%", background: p.color, border: `2px solid ${C.white}` }} />
                            </div>
                            <div style={{ width: 52, fontSize: 13, fontWeight: "bold", fontFamily: "sans-serif", color: p.color, flexShrink: 0 }}>{fmt(p.val)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </>
            )}

            <button onClick={() => setActiveTab("batna")} style={nextBtnSt}>PROCEED TO BATNA →</button>
          </div>
        )}

        {/* ── BATNA ── */}
        {activeTab === "batna" && (
          <div>
            <InfoBox>
              Your BATNA is your Best Alternative to a Negotiated Agreement. Knowing the true cost of walking away tells you exactly how hard you can push before switching makes more sense than settling.
            </InfoBox>

            <Card title="Cost of Capital (WACC)" subtitle="Used to calculate payment terms value.">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={50} value={wacc} onChange={e => setWacc(e.target.value)} placeholder="10" style={{ ...inputSt, width: 100 }} />
                <span style={{ fontSize: 13, fontFamily: "sans-serif", color: C.gray }}>%</span>
              </div>
            </Card>

            <Card title="Alternative Supplier Inputs" subtitle="Enter costs associated with your best alternative.">
              <Col>
                {[
                  { label: "Alternative Supplier Unit Price", val: batnaAltPrice,  set: setBatnaAltPrice,  hint: "The unit price from your best qualified alternative supplier.", key: "h_altp" },
                  { label: "Qualification Cost (one-time)",   val: batnaQualCost,  set: setBatnaQualCost,  hint: "Total cost to qualify the alternative: audit, PPAP, first article, engineering time.", key: "h_qualc" },
                  { label: "Transition Cost (one-time)",      val: batnaTransCost, set: setBatnaTransCost, hint: "Cost to switch: tooling transfer, safety stock build, ramp-up productivity loss.", key: "h_transc" },
                ].map(row => (
                  <div key={row.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <FieldLabel>{row.label}</FieldLabel>
                      <HintBtn k={row.key} open={openHint} set={setOpenHint} />
                    </div>
                    {openHint === row.key && <HintBox>{row.hint}</HintBox>}
                    <DollarInput val={row.val} set={row.set} />
                  </div>
                ))}
              </Col>
            </Card>

            {hasBatnaData && batnaValue && (
              <Card title="BATNA Value" subtitle="The true cost of walking away.">
                <Col>
                  <div style={{ background: batnaValue.priceDiff > 0 ? C.amberLight : C.greenLight, border: `1px solid ${batnaValue.priceDiff > 0 ? C.amber : C.green}`, borderRadius: 4, padding: "12px" }}>
                    <div style={{ fontSize: 11, fontFamily: "sans-serif", fontWeight: "bold", color: batnaValue.priceDiff > 0 ? C.amber : C.green, marginBottom: 4 }}>
                      {batnaValue.priceDiff > 0 ? "⚠ ALTERNATIVE IS MORE EXPENSIVE" : "✓ ALTERNATIVE IS CHEAPER"}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "sans-serif", color: batnaValue.priceDiff > 0 ? C.amber : C.green }}>
                      {fmt(Math.abs(batnaValue.priceDiff), 0)} / year
                    </div>
                    <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif", marginTop: 4 }}>
                      {batnaValue.priceDiff > 0
                        ? `Alt ${fmt(altP)} vs current ${fmt(curr)} — ${fmt(Math.abs((altP - curr)), 2)} more per unit × ${vol?.toLocaleString()} units`
                        : `Alt ${fmt(altP)} vs current ${fmt(curr)} — ${fmt(Math.abs(curr - altP), 2)} cheaper per unit × ${vol?.toLocaleString()} units`}
                    </div>
                  </div>

                  {batnaValue.oneTimeCosts > 0 && (
                    <div style={{ background: C.amberLight, border: `1px solid ${C.amber}`, borderRadius: 4, padding: "12px" }}>
                      <div style={{ fontSize: 11, fontFamily: "sans-serif", fontWeight: "bold", color: C.amber, marginBottom: 4 }}>ONE-TIME SWITCHING COSTS</div>
                      <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "sans-serif", color: C.amber }}>{fmt(batnaValue.oneTimeCosts, 0)}</div>
                      <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif", marginTop: 4 }}>Qualification: {fmt(qualC || 0, 0)} + Transition: {fmt(transC || 0, 0)}</div>
                    </div>
                  )}

                  {batnaValue.breakeven && (
                    <div style={{ background: C.navy, border: `1px solid ${C.gold}`, borderRadius: 4, padding: "12px" }}>
                      <div style={{ fontSize: 11, fontFamily: "sans-serif", fontWeight: "bold", color: C.gold, marginBottom: 4 }}>BREAKEVEN TO SWITCH</div>
                      <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "sans-serif", color: C.white }}>{batnaValue.breakeven.toFixed(1)} months</div>
                      <div style={{ fontSize: 11, color: C.htext, fontFamily: "sans-serif", marginTop: 4 }}>Time for annual price savings to recover the one-time switching cost</div>
                    </div>
                  )}

                  <div style={{ background: "#F2EFE8", border: `1px solid ${C.lightGray}`, borderRadius: 4, padding: "12px" }}>
                    <div style={{ fontSize: 11, fontFamily: "sans-serif", fontWeight: "bold", color: C.navy, marginBottom: 6 }}>LEVERAGE ASSESSMENT</div>
                    <div style={{ fontSize: 12, fontFamily: "sans-serif", color: C.gray, lineHeight: 1.6 }}>
                      {batnaValue.priceDiff <= 0
                        ? "Strong BATNA. Your alternative is cheaper. The current supplier has more to lose. Use this leverage explicitly."
                        : batnaValue.breakeven && batnaValue.breakeven < 18
                        ? "Moderate BATNA. Switching costs are recoverable within 18 months. The threat to switch is credible."
                        : "Weaker BATNA. High switching costs limit leverage. Focus on value and relationship rather than the threat to switch."}
                    </div>
                  </div>
                </Col>
              </Card>
            )}

            <button onClick={() => setActiveTab("concessions")} style={nextBtnSt}>PROCEED TO CONCESSIONS →</button>
          </div>
        )}

        {/* ── CONCESSIONS ── */}
        {activeTab === "concessions" && (
          <div>
            <InfoBox>
              Enter concessions you could offer if needed. The calculator estimates the value of each to the supplier and sequences them cheapest first. Always deploy the least costly concession first.
            </InfoBox>

            {CONCESSION_TYPES.map(cat => (
              <Card key={cat.key} title={cat.label} subtitle={concessionValues[cat.key] ? `Estimated value to supplier: ${fmt(concessionValues[cat.key], 0)} / year` : "Enter value to calculate"}>
                <HintBtn k={cat.key} open={openHint} set={setOpenHint} label="How to calculate" />
                {openHint === cat.key && <HintBox style={{ marginTop: 8 }}>{cat.hint}</HintBox>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <input type="number" min={0} value={concessions[cat.key]} onChange={e => setConcessions(p => ({ ...p, [cat.key]: e.target.value }))} placeholder={cat.placeholder} style={{ ...inputSt, flex: 1 }} />
                  <span style={{ fontSize: 12, color: C.gray, fontFamily: "sans-serif", flexShrink: 0 }}>{cat.unit}</span>
                </div>
              </Card>
            ))}

            {hasConcessionData && (
              <Card title="Concession Deployment Sequence" subtitle="Give the cheapest concessions first. Never deploy multiple at once.">
                {concessionSequence.map((c, idx) => (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "10px", background: idx % 2 === 0 ? C.white : "#F2EFE8", border: `1px solid ${C.lightGray}`, borderRadius: 4 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.navy, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", fontFamily: "sans-serif", flexShrink: 0 }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: C.navy, fontFamily: "sans-serif" }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif" }}>{c.input} {c.unit}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: "bold", fontFamily: "sans-serif", color: C.navy }}>{fmt(c.value, 0)}</div>
                      <div style={{ fontSize: 10, color: C.gray, fontFamily: "sans-serif" }}>to supplier / yr</div>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            <button onClick={() => setActiveTab("brief")} style={nextBtnSt}>VIEW NEGOTIATION BRIEF →</button>
          </div>
        )}

        {/* ── BRIEF ── */}
        {activeTab === "brief" && (
          <div>
            {!hasPositionData ? (
              <div style={{ textAlign: "center", padding: "40px", color: C.gray, fontFamily: "sans-serif", fontSize: 13, background: C.white, borderRadius: 6, border: `1px dashed ${C.lightGray}` }}>
                Enter pricing inputs on the Position tab to generate your brief.
              </div>
            ) : (
              <>
                <div ref={briefRef} style={{ background: C.offWhite, padding: "4px 0" }}>
                <div style={{ background: C.navy, border: `2px solid ${C.gold}`, borderRadius: 6, padding: "16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: C.gold, fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 2, marginBottom: 6 }}>NEGOTIATION BRIEF</div>
                  {supplierName && <div style={{ fontSize: 18, fontWeight: "bold", color: C.white, marginBottom: 2 }}>{supplierName}</div>}
                  {category    && <div style={{ fontSize: 13, color: C.htext, fontFamily: "sans-serif" }}>{category}</div>}
                </div>

                <Card title="Your Position" subtitle="Price targets and negotiation range.">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {[
                      { label: "OPEN WITH", val: openingPosition, col: C.navy,  bg: C.lightGray  },
                      { label: "TARGET",    val: tgt,             col: C.green, bg: C.greenLight  },
                      { label: "WALKAWAY",  val: walk,            col: C.amber, bg: C.amberLight  },
                      { label: "CURRENT",   val: curr,            col: C.gray,  bg: "#F2EFE8"     },
                    ].filter(p => p.val !== null).map((p, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 72, background: p.bg, border: `1.5px solid ${p.col}`, borderRadius: 4, padding: "10px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, fontFamily: "sans-serif", fontWeight: "bold", color: p.col, letterSpacing: 1, marginBottom: 4 }}>{p.label}</div>
                        <div style={{ fontSize: 18, fontWeight: "bold", fontFamily: "sans-serif", color: p.col }}>{fmt(p.val)}</div>
                      </div>
                    ))}
                  </div>
                  {vol && annualSavingsAtTarget !== null && (
                    <div style={{ background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 4, padding: "8px 12px", fontSize: 12, fontFamily: "sans-serif", color: C.green, fontWeight: "bold" }}>
                      {annualSavingsAtTarget >= 0
                        ? `Annual savings at target: ${fmt(annualSavingsAtTarget, 0)} / year`
                        : `Target is above current price — annual cost increase at target: ${fmt(Math.abs(annualSavingsAtTarget), 0)} / year`}
                    </div>
                  )}
                </Card>

                <Card title="Evidence to Present" subtitle="Data points to support your position in the room.">
                  <Col>
                    {bench && curr && (
                      <EvidenceRow icon="📊" label="Market Benchmark" value={`${fmt(bench)} per unit`} note={`Current price is ${fmt(Math.abs(curr - bench))} (${(Math.abs((curr - bench) / bench) * 100).toFixed(1)}%) ${curr > bench ? "above" : "below"} market`} color={curr > bench ? C.red : C.green} />
                    )}
                    {sc && curr && (
                      <EvidenceRow icon="🔬" label="Should-Cost Estimate" value={`${fmt(sc)} per unit`} note={`Current price is ${fmt(Math.abs(curr - sc))} (${(Math.abs((curr - sc) / sc) * 100).toFixed(1)}%) ${curr > sc ? "above" : "below"} should-cost`} color={curr > sc ? C.amber : C.green} />
                    )}
                    {hasBatnaData && batnaValue && batnaValue.priceDiff <= 0 && (
                      <EvidenceRow icon="🔄" label="Qualified Alternative" value={`${fmt(altP)} per unit`} note={`Alternative is ${fmt(Math.abs(curr - altP))} per unit cheaper. Switching is executable.`} color={C.green} />
                    )}
                    {!bench && !sc && !(hasBatnaData && batnaValue && batnaValue.priceDiff <= 0) && (
                      <div style={{ fontSize: 12, color: C.gray, fontFamily: "sans-serif", textAlign: "center", padding: "16px" }}>Enter market benchmark or should-cost on the Position tab to generate evidence.</div>
                    )}
                  </Col>
                </Card>

                {hasConcessionData && (
                  <Card title="Concession Sequence" subtitle="Deploy in order. Start with #1 only.">
                    {concessionSequence.map((c, idx) => (
                      <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 10px", background: idx % 2 === 0 ? C.white : "#F2EFE8", border: `1px solid ${C.lightGray}`, borderRadius: 4 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.navy, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", fontFamily: "sans-serif", flexShrink: 0 }}>{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: "bold", color: C.navy, fontFamily: "sans-serif" }}>{c.label}</div>
                          <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif" }}>{c.input} {c.unit} · worth {fmt(c.value, 0)} to supplier</div>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}

                <Card title="Opening Language" subtitle="Suggested phrases to open the negotiation.">
                  <Col>
                    {[
                      bench  && `"Our market benchmark for this category is ${fmt(bench)}. We need your pricing to be competitive with that."`,
                      sc     && `"Our cost analysis suggests this part should cost ${fmt(sc)} to produce. We are looking for pricing that reflects the underlying cost."`,
                      tgt    && `"We are targeting ${fmt(tgt)} per unit for this renewal. What can you do to help us get there?"`,
                      hasBatnaData && batnaValue && batnaValue.priceDiff <= 0 && `"We have a qualified alternative at ${fmt(altP)}. We would prefer to keep the business with you, but we need the economics to work."`,
                    ].filter(Boolean).map((phrase, idx) => (
                      <div key={idx} style={{ background: "#F2EFE8", border: `1px solid ${C.lightGray}`, borderRadius: 4, padding: "10px 12px", fontSize: 12, fontFamily: "'Georgia', serif", color: C.navy, lineHeight: 1.6, fontStyle: "italic" }}>{phrase}</div>
                    ))}
                  </Col>
                </Card>

                </div> {/* end briefRef div */}

                <button onClick={downloadPDF} style={{ background: C.navy, color: C.gold, border: `2px solid ${C.gold}`, borderRadius: 4, padding: "12px", fontSize: 13, fontFamily: "sans-serif", fontWeight: "bold", letterSpacing: 1, cursor: "pointer", width: "100%", marginBottom: 10 }}>
                  ⬇ DOWNLOAD BRIEF AS PDF
                </button>

                <button onClick={() => { setSupplierName(""); setCategory(""); setAnnualVolume(""); setCurrentPrice(""); setMarketBenchmark(""); setShouldCost(""); setTargetPrice(""); setWalkawayPrice(""); setBatnaAltPrice(""); setBatnaQualCost(""); setBatnaTransCost(""); setConcessions({ paymentTerms: "", volumeCommit: "", contractLength: "", specFlex: "" }); setActiveTab("position"); }} style={{ background: "transparent", border: `1px solid ${C.lightGray}`, borderRadius: 4, padding: "10px", fontSize: 12, fontFamily: "sans-serif", color: C.gray, cursor: "pointer", letterSpacing: 1, width: "100%" }}>
                  ↺ START NEW PREPARATION
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ background: C.navy, borderTop: `2px solid ${C.gold}`, padding: "10px 16px", textAlign: "center" }}>
        <span style={{ fontSize: 10, color: C.htext, fontFamily: "sans-serif", letterSpacing: 1 }}>FLANAGAN SOURCING INTELLIGENCE PORTFOLIO · MATTHEW FLANAGAN, CPSM</span>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InfoBox({ children }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.gold}`, borderRadius: 6, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: C.htext, fontFamily: "sans-serif", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function Col({ children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
}

function Field({ label, children }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: "bold", color: C.navy, fontFamily: "sans-serif", marginBottom: 4 }}>{children}</div>;
}

function HintBtn({ k, open, set, label = "?" }) {
  return (
    <button onClick={() => set(open === k ? null : k)} style={{ background: "none", border: `1px solid ${C.lightGray}`, borderRadius: 10, padding: "1px 8px", fontSize: 10, color: C.gray, fontFamily: "sans-serif", cursor: "pointer" }}>
      {open === k ? "Hide" : label}
    </button>
  );
}

function HintBox({ children }) {
  return (
    <div style={{ background: C.goldLight, border: `1px solid ${C.gold}`, borderRadius: 4, padding: "6px 10px", marginBottom: 6, marginTop: 4, fontSize: 11, fontFamily: "sans-serif", color: C.navy, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function DollarInput({ val, set }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ background: C.navy, color: C.white, padding: "8px 8px", fontSize: 13, fontWeight: "bold", borderRadius: "4px 0 0 4px", lineHeight: 1, flexShrink: 0 }}>$</span>
      <input type="number" min={0} step="0.01" value={val} onChange={e => set(e.target.value)} placeholder="0.00" style={{ ...inputSt, borderRadius: "0 4px 4px 0", borderLeft: "none", flex: 1 }} />
    </div>
  );
}

function EvidenceRow({ icon, label, value, note, color }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", background: C.white, border: `1px solid ${C.lightGray}`, borderRadius: 4, alignItems: "flex-start" }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: "bold", color: C.navy, fontFamily: "sans-serif" }}>{label}: <span style={{ color }}>{value}</span></div>
        <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif", marginTop: 2 }}>{note}</div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.lightGray}`, borderRadius: 6, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ background: "#F2EFE8", borderBottom: `2px solid ${C.gold}`, padding: "10px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: C.navy, fontFamily: "sans-serif" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.gray, fontFamily: "sans-serif", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: "14px" }}>{children}</div>
    </div>
  );
}

const inputSt = {
  border: "1px solid #E8E4DC", borderRadius: 4, padding: "8px 10px",
  fontSize: 13, fontFamily: "sans-serif", color: "#1B2A4A",
  background: "#FFFFFF", outline: "none", width: "100%", boxSizing: "border-box",
};

const nextBtnSt = {
  background: "#1B2A4A", color: "#FFFFFF", border: "2px solid #C8A84B",
  borderRadius: 4, padding: "12px", fontSize: 13, fontFamily: "sans-serif",
  fontWeight: "bold", letterSpacing: 1, cursor: "pointer", width: "100%",
};