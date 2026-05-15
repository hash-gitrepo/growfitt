const { Resend } = require("resend");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { to, companyName, scores, answers } = payload;
  const a = answers || {};

  if (!to || !companyName || !scores) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields: to, companyName, scores" }) };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const s = scores;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const zoneColor = s.zone === "Fit" ? "#1a6632" : s.zone === "Over" ? "#c0392b" : "#b35c00";
  const zoneBg   = s.zone === "Fit" ? "#e7f4ea"  : s.zone === "Over" ? "#fdf0ef"  : "#fef6ec";

  const THRESHOLD = 3.0;

  // GFS tier
  const gfsTier = (v) => {
    if (v >= 4.5) return { label: "Elite",   color: "#1a6632", bg: "#e8f4e9" };
    if (v >= 3.8) return { label: "Strong",  color: "#639922", bg: "#f0f7e6" };
    if (v >= 3.0) return { label: "Average", color: "#ca8a04", bg: "#fef9ec" };
    if (v >= 2.5) return { label: "Fragile", color: "#e07b00", bg: "#fef6ec" };
    return             { label: "Broken",  color: "#c0392b", bg: "#fdf0ef" };
  };
  const adjScore = s.adjGFS || s.GFS;
  const tier = gfsTier(adjScore);

  // ── GFS SCORE DIAL — Gmail-safe HTML/CSS (no SVG) ────────────────────────────
  // 5 coloured segments as table cells, score centred below, needle approximated
  // by highlighting the active segment
  const dialTiers = [
    { label: "Broken",  min: 0,   max: 2.5, color: "#c0392b" },
    { label: "Fragile", min: 2.5, max: 3.0, color: "#e07b00" },
    { label: "Average", min: 3.0, max: 3.8, color: "#ca8a04" },
    { label: "Strong",  min: 3.8, max: 4.5, color: "#639922" },
    { label: "Elite",   min: 4.5, max: 5.0, color: "#1a6632" },
  ];
  // Which segment is active?
  const activeTierIdx = dialTiers.findIndex(t => adjScore >= t.min && adjScore < t.max);
  const activeIdx = activeTierIdx === -1 ? dialTiers.length - 1 : activeTierIdx;

  // Segment widths proportional to range size (total = 5 units)
  const segWidths = dialTiers.map(t => Math.round((t.max - t.min) / 5 * 100));

  // Position marker: how far along the 540px bar is the needle?
  const needlePct = Math.min(100, Math.max(0, (adjScore / 5) * 100));

  const dialHtml = (
    // Outer wrapper — white, no background box
    '<div style="text-align:center;padding:28px 24px 20px;">'
    // Section title
    +'<div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px">What does your score mean?</div>'
    // Score + label row — mimics the app card layout
    +'<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px"><tr>'
      // Left: big score
      +'<td style="text-align:left;vertical-align:middle;width:50%">'
        +'<div style="font-size:56px;font-weight:800;color:'+tier.color+';line-height:1;letter-spacing:-2px">'+adjScore.toFixed(2)+'</div>'
        +'<div style="font-size:13px;color:#8a8c87;margin-top:4px">/5.00 &nbsp;Growth Fitness Score</div>'
      +'</td>'
      // Right: tier badge + scale reference
      +'<td style="text-align:right;vertical-align:middle;width:50%">'
        +'<div style="display:inline-block;padding:8px 22px;border-radius:24px;background:'+tier.bg+';color:'+tier.color+';font-size:18px;font-weight:700;letter-spacing:0.3px;margin-bottom:8px">'+tier.label+'</div>'
        +'<div style="font-size:11px;color:#8a8c87">Scored out of 5.00</div>'
      +'</td>'
    +'</tr></table>'
    // Progress bar — 5 pill segments with gap between them
    +'<table width="100%" cellpadding="0" cellspacing="4" style="margin-bottom:6px"><tr>'
    + dialTiers.map(function(t, i) {
        const isActive = i === activeIdx;
        // Pill height: active = 20px, inactive = 12px; border-radius: 100px for pill shape
        const h = isActive ? '20' : '12';
        const opacity = isActive ? '1' : '0.22';
        const mt = isActive ? '0' : '4'; // vertically centre inactive pills
        return '<td style="width:'+segWidths[i]+'%;padding:0">'
          +'<div style="height:'+h+'px;margin-top:'+mt+'px;background:'+t.color+';opacity:'+opacity+';border-radius:100px">&nbsp;</div>'
          +'</td>';
      }).join("")
    +'</tr></table>'
    // Labels below segments
    +'<table width="100%" cellpadding="0" cellspacing="4"><tr>'
    + dialTiers.map(function(t, i) {
        const isActive = i === activeIdx;
        return '<td style="width:'+segWidths[i]+'%;text-align:center;font-size:10px;font-weight:'+(isActive?'700':'400')+';color:'+(isActive?t.color:'#c0c0c0')+';padding-top:5px">'+t.label+'</td>';
      }).join("")
    +'</tr></table>'
    // Score range legend — coloured dots with range labels (matches app)
    +'<div style="margin-top:16px;padding-top:14px;border-top:1px solid #f0f0f0">'
    +'<table align="center" cellpadding="0" cellspacing="0"><tr>'
    + dialTiers.map(function(t) {
        const rangeLabel = t.min === 0   ? '&lt;&nbsp;2.5'
                         : t.max === 5.0 ? '4.5&nbsp;&ndash;&nbsp;5'
                         : t.min.toString().replace('.','.')+'&nbsp;&ndash;&nbsp;'+t.max.toString().replace('.','.') ;
        return '<td style="padding:3px 10px;white-space:nowrap">'
          +'<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+t.color+';vertical-align:middle;margin-right:5px"></span>'
          +'<span style="font-size:11px;color:#5a5c57;vertical-align:middle">'+rangeLabel+' '+t.label+'</span>'
          +'</td>';
      }).join("")
    +'</tr></table>'
    +'</div>'
    +'</div>'
  );

  // ── ATLAS URL — built server-side from answers ────────────────────────────────
  const atlasBase = "https://growfitt.ai/atlas";
  const atlasParams = new URLSearchParams();
  if (a.category) atlasParams.set("cat", a.category);
  const arrV = parseFloat(a.arr_revenue);
  if (!isNaN(arrV)) {
    const band = arrV < 1   ? "<$1M"
               : arrV < 5   ? "$1M\u2013$5M"
               : arrV < 10  ? "$5M\u2013$10M"
               : arrV < 25  ? "$10M\u2013$25M"
               : arrV < 50  ? "$25M\u2013$50M"
               : arrV < 100 ? "$50M\u2013$100M"
               :               "$100M+";
    atlasParams.set("arr", band);
  }
  if (a.growth_rate) atlasParams.set("growth", Math.round(parseFloat(a.growth_rate)));
  if (a.gm)         atlasParams.set("gm",     Math.round(parseFloat(a.gm)));
  const geoMap = {
    "North America": "North America", "Europe": "Europe",
    "India & SEA": "Southeast Asia",  "Middle East & Africa": "Middle East",
    "China": "Southeast Asia",        "Asia Pacific (incl. Japan)": "Southeast Asia",
    "Global": "Global"
  };
  if (a.primary_market && geoMap[a.primary_market]) atlasParams.set("geo", geoMap[a.primary_market]);
  const atlasUrl = atlasBase + "?" + atlasParams.toString();

  // ── QUALITATIVE CONTEXT ───────────────────────────────────────────────────────
  const qualRows = [];
  if (a.ai_impact)          qualRows.push(["AI impact on growth",    a.ai_impact]);
  if (a.deal_quality)       qualRows.push(["Deal quality trend",     a.deal_quality]);
  if (a.cohort_trend)       qualRows.push(["Retention cohort trend", a.cohort_trend]);
  if (a.platform_expansion) qualRows.push(["Platform expansion",     a.platform_expansion]);
  if (a.ai_revenue)         qualRows.push(["Revenue from AI",        a.ai_revenue]);
  if (a.usage_growth)       qualRows.push(["Usage growth trend",     a.usage_growth]);

  const qualHtml = qualRows.length ? (
    '<div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">'
    +'<div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Qualitative context</div>'
    +'<table width="100%" cellpadding="0" cellspacing="0">'
    +qualRows.map(function(row) {
      return '<tr>'
        +'<td style="font-size:12px;color:#8a8c87;padding:5px 0;width:180px;vertical-align:top">'+row[0]+'</td>'
        +'<td style="font-size:13px;color:#1a1a18;font-weight:500;padding:5px 0">'+row[1]+'</td>'
        +'</tr>';
    }).join("")
    +'</table></div>'
  ) : "";

  // ── COMPONENT SCORE BARS ──────────────────────────────────────────────────────
  const barHtml = (label, val) => {
    const pct = Math.round((val / 5) * 100);
    const below = val < THRESHOLD;
    const barColour = below ? "#c0392b" : "#1a6632";
    const valColour = below ? "#c0392b" : "#1a1a18";
    const flag = below ? '<span style="font-size:10px;font-weight:600;color:#c0392b;background:#fdf0ef;padding:2px 7px;border-radius:4px;margin-left:6px;">Below threshold</span>' : "";
    return "<tr>"
      +'<td style="font-size:13px;color:#5a5c57;padding:6px 0;width:160px">'+label+"</td>"
      +'<td style="padding:6px 8px"><div style="background:#f2f4f1;border-radius:4px;height:8px;overflow:hidden"><div style="background:'+barColour+";width:"+pct+'%;height:8px;border-radius:4px"></div></div></td>'
      +'<td style="font-size:13px;font-weight:600;color:'+valColour+';padding:6px 0;width:36px;text-align:right">'+val.toFixed(1)+"</td>"
      +'<td style="padding:6px 0 6px 4px;">'+flag+"</td>"
      +"</tr>";
  };

  const recsList = (s.recommendations || [])
    .map(r => '<li style="font-size:13.5px;color:#5a5c57;line-height:1.6;margin-bottom:10px">'+r+"</li>")
    .join("");

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f8f6;font-family:-apple-system,'Segoe UI',system-ui,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.08)">

    <div style="background:#1a6632;padding:24px 28px">
      <div style="font-size:11px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">GrowFitt Growth Audit</div>
      <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">${companyName.replace(".", "\u2060.\u2060")}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px">Generated ${date}</div>
    </div>

    <div style="border-bottom:1px solid rgba(0,0,0,0.07)">
      ${dialHtml}
      <!-- Zone + OGR strip -->
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 24px 20px"><tr>
        <td style="vertical-align:middle">
          <div style="display:inline-block;padding:5px 16px;border-radius:20px;font-size:13px;font-weight:600;background:${zoneBg};color:${zoneColor}">
            ${s.interpretation} &middot; ${s.zone} zone
          </div>
        </td>
        <td style="text-align:right;vertical-align:middle">
          <span style="font-size:11px;color:#8a8c87;text-transform:uppercase;letter-spacing:0.5px;margin-right:8px">OGR</span>
          <span style="font-size:16px;font-weight:700;color:#1a1a18">${(s.OGR_Low*100).toFixed(0)}&ndash;${(s.OGR_High*100).toFixed(0)}%</span>
          &nbsp;&nbsp;
          <span style="font-size:11px;color:#8a8c87;text-transform:uppercase;letter-spacing:0.5px;margin-right:8px">Growth</span>
          <span style="font-size:16px;font-weight:700;color:${zoneColor}">${(s.growth*100).toFixed(0)}%</span>
        </td>
      </tr></table>
    </div>

    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Key metrics</div>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="width:25%;padding-right:8px"><div style="background:#f2f4f1;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">NRR</div>
          <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.nrr*100).toFixed(0)}%</div>
        </div></td>
        <td style="width:25%;padding-right:8px"><div style="background:#f2f4f1;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">GRR</div>
          <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.grr*100).toFixed(0)}%</div>
        </div></td>
        <td style="width:25%;padding-right:8px"><div style="background:#f2f4f1;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">Gross margin</div>
          <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.gm*100).toFixed(0)}%</div>
        </div></td>
        <td style="width:25%"><div style="background:#f2f4f1;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">FCF margin</div>
          <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.fcf*100).toFixed(0)}%</div>
        </div></td>
      </tr></table>
    </div>

    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Component scores</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${barHtml("Growth quality (GQS)", s.GQS)}
        ${barHtml("Retention score (RS)", s.RS)}
        ${barHtml("Efficiency score (ES)", s.ES)}
      </table>
    </div>

    ${qualHtml}

    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07);text-align:center">
      <a href="${atlasUrl}" style="display:inline-block;padding:12px 28px;background:#185fa5;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif">
        &#127760;&nbsp; View your benchmark position in Atlas
      </a>
      <div style="font-size:11px;color:#8a8c87;margin-top:8px">See how you rank against 7,400 public SaaS companies</div>
    </div>

    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Recommendations</div>
      <ul style="margin:0;padding-left:18px">${recsList}</ul>
    </div>

    <div style="padding:18px 28px;background:#f7f8f6">
      <div style="font-size:12px;color:#8a8c87;line-height:1.6">
        Report generated by <strong style="color:#1a6632">GrowFitt</strong> &mdash; A quantified control system for growth and revenue teams<br>
        <a href="mailto:hello@growfitt.ai" style="color:#1a6632">hello@growfitt.ai</a> &middot; <a href="https://growfitt.ai" style="color:#1a6632">growfitt.ai</a>
      </div>
    </div>

  </div>
</body>
</html>`;

  const textBody = [
    "GrowFitt Growth Audit — " + companyName,
    "Generated: " + date,
    "",
    "GROWTH FITNESS SCORE: " + adjScore.toFixed(2) + " / 5.00 — " + tier.label + " (" + s.interpretation + ")",
    "ZONE: " + s.zone,
    "",
    "Optimal Growth Range: " + (s.OGR_Low*100).toFixed(0) + "–" + (s.OGR_High*100).toFixed(0) + "%",
    "Current Growth Rate: " + (s.growth*100).toFixed(0) + "%",
    "",
    "COMPONENT SCORES",
    "  Growth Quality (GQS): " + s.GQS.toFixed(2) + (s.GQS < 3.0 ? " ⚠ Below threshold" : ""),
    "  Retention Score (RS):  " + s.RS.toFixed(2)  + (s.RS  < 3.0 ? " ⚠ Below threshold" : ""),
    "  Efficiency Score (ES): " + s.ES.toFixed(2)  + (s.ES  < 3.0 ? " ⚠ Below threshold" : ""),
    "",
    "KEY METRICS",
    "  NRR: " + (s.nrr*100).toFixed(0) + "% | GRR: " + (s.grr*100).toFixed(0) + "% | Gross Margin: " + (s.gm*100).toFixed(0) + "% | FCF: " + (s.fcf*100).toFixed(0) + "%",
    "",
    "VIEW YOUR BENCHMARK POSITION: " + atlasUrl,
    "",
    "RECOMMENDATIONS",
    (s.recommendations || []).map((r, i) => (i+1) + ". " + r).join("\n"),
    "",
    "---",
    "hello@growfitt.ai · growfitt.ai",
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: "GrowFitt <noreply@growfitt.ai>",
      to: [to],
      subject: "GrowFitt Growth Audit — " + companyName + " | GFS " + adjScore.toFixed(2) + "/5.00",
      html: htmlBody,
      text: textBody,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, id: result.data?.id }),
    };
  } catch (err) {
    console.error("Resend error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to send email", detail: err.message }),
    };
  }
};
