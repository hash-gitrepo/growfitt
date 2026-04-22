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

  const { to, companyName, scores } = payload;

  if (!to || !companyName || !scores) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields: to, companyName, scores" }) };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const s = scores;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const zoneColor = s.zone === "Fit" ? "#1a6632" : s.zone === "Over" ? "#c0392b" : "#b35c00";
  const zoneBg   = s.zone === "Fit" ? "#e7f4ea"  : s.zone === "Over" ? "#fdf0ef"  : "#fef6ec";

  const barHtml = (label, val) => {
    const pct = Math.round((val / 5) * 100);
    return `
      <tr>
        <td style="font-size:13px;color:#5a5c57;padding:6px 0;width:160px">${label}</td>
        <td style="padding:6px 8px">
          <div style="background:#f2f4f1;border-radius:4px;height:8px;overflow:hidden">
            <div style="background:#1a6632;width:${pct}%;height:8px;border-radius:4px"></div>
          </div>
        </td>
        <td style="font-size:13px;font-weight:600;color:#1a1a18;padding:6px 0;width:36px;text-align:right">${val.toFixed(1)}</td>
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
      <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">${companyName}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px">Generated ${date}</div>
    </div>

    <!-- Score hero -->
    <div style="padding:28px 28px 0;border-bottom:1px solid rgba(0,0,0,0.07);padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:48px;font-weight:700;color:#1a1a18;line-height:1;letter-spacing:-2px">
              ${s.GFS.toFixed(2)}<span style="font-size:20px;font-weight:400;color:#5a5c57">/5.00</span>
            </div>
            <div style="font-size:13px;color:#5a5c57;margin-top:4px">Growth Fitness Score</div>
            <div style="display:inline-block;margin-top:12px;padding:5px 16px;border-radius:20px;font-size:13px;font-weight:600;background:${zoneBg};color:${zoneColor}">
              ${s.interpretation} &middot; ${s.zone} zone
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

    <!-- Recommendations -->
    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px">Recommendations</div>
      <ul style="margin:0;padding-left:18px">${recsList}</ul>
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
  Growth Quality (GQS): ${s.GQS.toFixed(2)}
  Retention Score (RS):  ${s.RS.toFixed(2)}
  Efficiency Score (ES): ${s.ES.toFixed(2)}

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
      subject: `GrowFitt Growth Audit — ${companyName} | GFS ${s.GFS.toFixed(2)}/5.00`,
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
