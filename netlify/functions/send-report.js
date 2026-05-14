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

  // GFS interpretation tier
  const gfsTier = (v) => {
    if (v >= 4.5) return { label: 'Elite',   color: '#1a6632' };
    if (v >= 3.8) return { label: 'Strong',  color: '#639922' };
    if (v >= 3.0) return { label: 'Average', color: '#ca8a04' };
    if (v >= 2.5) return { label: 'Fragile', color: '#e07b00' };
    return             { label: 'Broken',  color: '#c0392b' };
  };
  const tier = gfsTier(s.adjGFS || s.GFS);

  // Qualitative context rows from new questions
  const qualRows = [];
  if (a.ai_impact)          qualRows.push(['AI impact on growth', a.ai_impact]);
  if (a.platform_expansion) qualRows.push(['Platform expansion trend', a.platform_expansion]);
  if (a.ai_revenue)         qualRows.push(['Revenue from AI', a.ai_revenue]);
  if (a.usage_growth)       qualRows.push(['Usage growth trend', a.usage_growth]);
  if (a.deal_quality)       qualRows.push(['Deal quality', a.deal_quality]);
  if (a.cohort_trend)       qualRows.push(['Retention cohort trend', a.cohort_trend]);

  const qualHtml = qualRows.length ? `
    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Qualitative context</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${qualRows.map(([label, val]) => `
        <tr>
          <td style="font-size:12px;color:#8a8c87;padding:5px 0;width:180px">${label}</td>
          <td style="font-size:13px;color:#1a1a18;font-weight:500;padding:5px 0">${val}</td>
        </tr>`).join('')}
      </table>
    </div>` : '';
  const barHtml = (label, val) => {
    const pct = Math.round((val / 5) * 100);
    const below = val < THRESHOLD;
    const barColour = below ? '#c0392b' : '#1a6632';
    const valColour = below ? '#c0392b' : '#1a1a18';
    const flag = below ? `<span style="font-size:10px;font-weight:600;color:#c0392b;background:#fdf0ef;padding:2px 7px;border-radius:4px;margin-left:6px;">Below threshold</span>` : '';
    return `
      <tr>
        <td style="font-size:13px;color:#5a5c57;padding:6px 0;width:160px">${label}</td>
        <td style="padding:6px 8px">
          <div style="background:#f2f4f1;border-radius:4px;height:8px;overflow:hidden">
            <div style="background:${barColour};width:${pct}%;height:8px;border-radius:4px"></div>
          </div>
        </td>
        <td style="font-size:13px;font-weight:600;color:${valColour};padding:6px 0;width:36px;text-align:right">${val.toFixed(1)}</td>
        <td style="padding:6px 0 6px 4px;">${flag}</td>
      </tr>`;
  };

  const recsList = (s.recommendations || [])
    .map(r => `<li style="font-size:13.5px;color:#5a5c57;line-height:1.6;margin-bottom:10px">${r}</li>`)
    .join("");

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f8f6;font-family:-apple-system,'Segoe UI',system-ui,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#1a6632;padding:24px 28px">
      <div style="font-size:11px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">GrowFitt Growth Audit</div>
      <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px"><span style="color:#ffffff !important;text-decoration:none !important;">${companyName.replace('.', '⁠.⁠')}</span></div>
      <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px">Generated ${date}</div>
    </div>

    <!-- Score hero -->
    <div style="padding:28px 28px 0;border-bottom:1px solid rgba(0,0,0,0.07);padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:48px;font-weight:700;color:#1a1a18;line-height:1;letter-spacing:-2px">
              ${(s.adjGFS || s.GFS).toFixed(2)}<span style="font-size:20px;font-weight:400;color:#5a5c57">/5.00</span>
            </div>
            <div style="font-size:13px;color:#5a5c57;margin-top:4px">Growth Fitness Score${s.hasAdjustment ? ' (adjusted)' : ''}</div>
            <div style="display:inline-block;margin-top:8px;padding:5px 16px;border-radius:20px;font-size:13px;font-weight:600;background:${zoneBg};color:${zoneColor}">
              ${s.interpretation} &middot; ${s.zone} zone
            </div>
            <div style="display:inline-block;margin-top:6px;margin-left:8px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${tier.color}18;color:${tier.color}">
              ${tier.label}
            </div>
          </td>
          <td style="text-align:right;vertical-align:top">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;padding:0 8px">
                  <div style="font-size:10px;color:#8a8c87;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">OGR Range</div>
                  <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.OGR_Low*100).toFixed(0)}–${(s.OGR_High*100).toFixed(0)}%</div>
                </td>
              </tr>
              <tr>
                <td style="text-align:center;padding:8px 8px 0">
                  <div style="font-size:10px;color:#8a8c87;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Current Growth</div>
                  <div style="font-size:18px;font-weight:600;color:${zoneColor}">${(s.growth*100).toFixed(0)}%</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

    <!-- Metrics row -->
    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Key metrics</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:25%;padding-right:8px">
            <div style="background:#f2f4f1;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">NRR</div>
              <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.nrr*100).toFixed(0)}%</div>
            </div>
          </td>
          <td style="width:25%;padding-right:8px">
            <div style="background:#f2f4f1;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">GRR</div>
              <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.grr*100).toFixed(0)}%</div>
            </div>
          </td>
          <td style="width:25%;padding-right:8px">
            <div style="background:#f2f4f1;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">Gross margin</div>
              <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.gm*100).toFixed(0)}%</div>
            </div>
          </td>
          <td style="width:25%">
            <div style="background:#f2f4f1;border-radius:8px;padding:12px">
              <div style="font-size:11px;color:#8a8c87;margin-bottom:4px">FCF margin</div>
              <div style="font-size:18px;font-weight:600;color:#1a1a18">${(s.fcf*100).toFixed(0)}%</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Component scores -->
    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Component scores</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${barHtml("Growth quality (GQS)", s.GQS)}
        ${barHtml("Retention score (RS)", s.RS)}
        ${barHtml("Efficiency score (ES)", s.ES)}
      </table>
    </div>

    <!-- Qualitative context -->
    ${qualHtml}

    <!-- Recommendations -->
    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Recommendations</div>
      <ul style="margin:0;padding-left:18px">${recsList}</ul>
    </div>

    <!-- Atlas CTA -->
    <div style="padding:16px 28px;border-bottom:1px solid rgba(0,0,0,0.07);text-align:center">
      <a href="https://growfitt.ai/atlas" style="display:inline-block;padding:11px 28px;background:#185fa5;color:#ffffff;border-radius:8px;font-size:13.5px;font-weight:600;text-decoration:none">
        🌐 View Atlas — compare your position to the full benchmark database
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:18px 28px;background:#f7f8f6">
      <div style="font-size:12px;color:#8a8c87;line-height:1.6">
        Report generated by <strong style="color:#1a6632">GrowFitt</strong> — A quantified control system for growth and revenue teams<br>
        <a href="mailto:hello@growfitt.ai" style="color:#1a6632">hello@growfitt.ai</a> &middot; <a href="https://growfitt.ai" style="color:#1a6632">growfitt.ai</a>
      </div>
    </div>

  </div>
</body>
</html>`;

  const textBody = `
GrowFitt Growth Audit — ${companyName}
Generated: ${date}

GROWTH FITNESS SCORE: ${s.GFS.toFixed(2)} / 5.00 (${s.interpretation})
ZONE: ${s.zone}

Optimal Growth Range: ${(s.OGR_Low*100).toFixed(0)}–${(s.OGR_High*100).toFixed(0)}%
Current Growth Rate: ${(s.growth*100).toFixed(0)}%

COMPONENT SCORES
  Growth Quality (GQS): ${s.GQS.toFixed(2)}${s.GQS < 3.0 ? ' ⚠ Below threshold' : ''}
  Retention Score (RS):  ${s.RS.toFixed(2)}${s.RS < 3.0 ? ' ⚠ Below threshold' : ''}
  Efficiency Score (ES): ${s.ES.toFixed(2)}${s.ES < 3.0 ? ' ⚠ Below threshold' : ''}

KEY METRICS
  NRR: ${(s.nrr*100).toFixed(0)}% | GRR: ${(s.grr*100).toFixed(0)}% | Gross Margin: ${(s.gm*100).toFixed(0)}% | FCF: ${(s.fcf*100).toFixed(0)}%

RECOMMENDATIONS
${(s.recommendations || []).map((r,i) => `${i+1}. ${r}`).join("\n")}

---
hello@growfitt.ai · growfitt.ai
  `.trim();

  try {
    const result = await resend.emails.send({
      from: "GrowFitt <noreply@growfitt.ai>",
      to: [to],
      subject: `GrowFitt Growth Audit — ${companyName} | GFS ${(s.adjGFS||s.GFS).toFixed(2)}/5.00`,
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
