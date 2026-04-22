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

  const { firstName, lastName, email, company, role, phone, purpose, arr, message } = payload;

  if (!firstName || !lastName || !email || !company || !role || !purpose || !message) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const date = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short"
  });

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f8f6;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#1a6632;padding:24px 28px;">
      <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">New contact form submission</div>
      <div style="font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">${firstName} ${lastName}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:3px;">${role} · ${company}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:8px;">${date}</div>
    </div>

    <!-- Purpose badge -->
    <div style="padding:20px 28px 0;">
      <div style="display:inline-block;padding:6px 16px;background:#e7f4ea;border-radius:20px;font-size:13px;font-weight:600;color:#1a6632;">${purpose}</div>
    </div>

    <!-- Sender details -->
    <div style="padding:20px 28px;border-bottom:1px solid rgba(0,0,0,0.07);">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;">Sender details</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;">
        <tr>
          <td style="color:#5a5c57;padding:5px 0;width:140px;">Full name</td>
          <td style="color:#1a1a18;font-weight:500;padding:5px 0;">${firstName} ${lastName}</td>
        </tr>
        <tr>
          <td style="color:#5a5c57;padding:5px 0;">Email</td>
          <td style="padding:5px 0;"><a href="mailto:${email}" style="color:#1a6632;text-decoration:none;">${email}</a></td>
        </tr>
        <tr>
          <td style="color:#5a5c57;padding:5px 0;">Company</td>
          <td style="color:#1a1a18;font-weight:500;padding:5px 0;">${company}</td>
        </tr>
        <tr>
          <td style="color:#5a5c57;padding:5px 0;">Role</td>
          <td style="color:#1a1a18;padding:5px 0;">${role}</td>
        </tr>
        ${phone ? `<tr><td style="color:#5a5c57;padding:5px 0;">Phone</td><td style="color:#1a1a18;padding:5px 0;">${phone}</td></tr>` : ""}
        ${arr ? `<tr><td style="color:#5a5c57;padding:5px 0;">ARR / Revenue</td><td style="color:#1a1a18;padding:5px 0;">${arr}</td></tr>` : ""}
      </table>
    </div>

    <!-- Message -->
    <div style="padding:20px 28px 28px;">
      <div style="font-size:11px;font-weight:600;color:#8a8c87;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px;">Message</div>
      <div style="font-size:14.5px;color:#1a1a18;line-height:1.7;white-space:pre-wrap;background:#f7f8f6;border-radius:8px;padding:16px 18px;border:1px solid rgba(0,0,0,0.06);">${message.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;background:#f7f8f6;border-top:1px solid rgba(0,0,0,0.06);">
      <div style="font-size:12px;color:#8a8c87;">
        Submitted via <strong style="color:#1a6632;">growfitt.ai/contact</strong> · Reply directly to this email to respond to ${firstName}.
      </div>
    </div>

  </div>
</body>
</html>`;

  const textBody = `New contact form submission — GrowFitt
${date}

FROM: ${firstName} ${lastName}
Email: ${email}
Company: ${company}
Role: ${role}
${phone ? `Phone: ${phone}\n` : ""}${arr ? `ARR/Revenue: ${arr}\n` : ""}
PURPOSE: ${purpose}

MESSAGE:
${message}

---
Submitted via growfitt.ai/contact`;

  try {
    // 1. Send notification to hello@growfitt.ai
    await resend.emails.send({
      from: "GrowFitt Contact <noreply@growfitt.ai>",
      to: ["hello@growfitt.ai"],
      reply_to: email,
      subject: `[GrowFitt] ${purpose} — ${firstName} ${lastName}, ${company}`,
      html: htmlBody,
      text: textBody,
    });

    // 2. Send acknowledgement to the sender
    await resend.emails.send({
      from: "GrowFitt <hello@growfitt.ai>",
      to: [email],
      subject: `We've received your message — GrowFitt`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f8f6;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);">
    <div style="background:#1a6632;padding:24px 28px;">
      <div style="font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">We've received your message</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">GrowFitt · Build to Scale</div>
    </div>
    <div style="padding:28px;">
      <p style="font-size:15px;color:#1a1a18;margin-bottom:16px;">Hi ${firstName},</p>
      <p style="font-size:14.5px;color:#5a5c57;line-height:1.7;margin-bottom:16px;">Thanks for reaching out. We've received your message regarding <strong style="color:#1a1a18;">${purpose}</strong> and will get back to you within one business day.</p>
      <p style="font-size:14.5px;color:#5a5c57;line-height:1.7;margin-bottom:28px;">In the meantime, you can run a quick growth fitness assessment at <a href="https://growfitt.ai" style="color:#1a6632;text-decoration:none;">growfitt.ai</a>.</p>
      <a href="https://growfitt.ai/index.html" style="display:inline-block;padding:13px 28px;background:#1a6632;color:#fff;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;">Get your Growth Fitness Score</a>
    </div>
    <div style="padding:16px 28px;background:#f7f8f6;border-top:1px solid rgba(0,0,0,0.06);">
      <div style="font-size:12px;color:#8a8c87;">© 2026 GrowFitt.AI · <a href="https://growfitt.ai" style="color:#1a6632;text-decoration:none;">growfitt.ai</a></div>
    </div>
  </div>
</body>
</html>`,
      text: `Hi ${firstName},\n\nThanks for reaching out. We've received your message regarding "${purpose}" and will get back to you within one business day.\n\nIn the meantime, you can run a quick growth fitness assessment at growfitt.ai.\n\n— The GrowFitt Team\nhello@growfitt.ai`,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
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
