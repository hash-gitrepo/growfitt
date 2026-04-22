// ─────────────────────────────────────────────────────────────────────────────
// GrowFitt — Email verification function
// Validates work email (blocks personal domains), generates OTP, sends it
// All domain logic is server-side — never exposed to the browser
// ─────────────────────────────────────────────────────────────────────────────

const { Resend } = require("resend");

// ── PERSONAL EMAIL DOMAIN BLOCKLIST ──────────────────────────────────────────
// Comprehensive list — never sent to browser
const BLOCKED_DOMAINS = new Set([
  "gmail.com","googlemail.com","google.com",
  "outlook.com","hotmail.com","hotmail.co.uk","hotmail.fr","hotmail.de","hotmail.it","hotmail.es",
  "live.com","live.co.uk","live.fr","live.de","live.in","msn.com","passport.com",
  "yahoo.com","yahoo.co.uk","yahoo.co.in","yahoo.fr","yahoo.de","yahoo.es","yahoo.it","yahoo.com.au","yahoo.com.br","yahoo.ca","ymail.com","rocketmail.com",
  "icloud.com","me.com","mac.com","apple.com",
  "aol.com","aim.com",
  "protonmail.com","proton.me","pm.me",
  "tutanota.com","tutanota.de","tutamail.com","tuta.io",
  "zoho.com","zohocorp.com",
  "mail.com","email.com","usa.com","myself.com","consultant.com","cheerful.com","techie.com","engineer.com",
  "yandex.com","yandex.ru","yandex.ua",
  "rediffmail.com","rediff.com",
  "gmx.com","gmx.de","gmx.net","gmx.at","gmx.ch","gmx.us","gmx.fr",
  "web.de","freenet.de","t-online.de",
  "fastmail.com","fastmail.fm",
  "hushmail.com","hush.com","hush.ai",
  "mailinator.com","guerrillamail.com","throwaway.email","tempmail.com","10minutemail.com","sharklasers.com","guerrillamailblock.com","grr.la","spam4.me","trashmail.com","dispostable.com",
  "inbox.com","inbox.lv","inbox.ru",
  "mail.ru","bk.ru","list.ru","internet.ru",
  "163.com","126.com","qq.com","sina.com","sina.cn","sohu.com","aliyun.com",
  "naver.com","daum.net","hanmail.net",
  "bigpond.com","bigpond.net.au",
  "shaw.ca","rogers.com","bell.net","sympatico.ca",
  "verizon.net","att.net","sbcglobal.net","comcast.net","cox.net","charter.net","earthlink.net",
  "btinternet.com","btopenworld.com","talktalk.net","sky.com","blueyonder.co.uk",
  "wanadoo.fr","orange.fr","free.fr","sfr.fr","laposte.net",
  "libero.it","virgilio.it","tiscali.it",
  "terra.com.br","uol.com.br","bol.com.br","ig.com.br",
  "seznam.cz","atlas.cz",
]);

// ── OTP STORE (in-memory — resets on function cold start, sufficient for MVP) ─
// For production, replace with Redis or DynamoDB
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isPersonalEmail(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return BLOCKED_DOMAINS.has(domain);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { action, email, otp } = body;

  // ── ACTION: request OTP ───────────────────────────────────────────────────
  if (action === "request") {
    if (!email || !isValidEmail(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Please enter a valid email address." }) };
    }
    if (isPersonalEmail(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Please use your work or company email address. Personal email accounts are not accepted." })
      };
    }

    const code = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email.toLowerCase(), { code, expires, attempts: 0 });

    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
      await resend.emails.send({
        from: "GrowFitt <hello@growfitt.ai>",
        to: [email],
        subject: "Your GrowFitt access code",
        html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f8f6;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);">
    <div style="background:#2e6b35;padding:24px 28px;">
      <div style="font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">GrowFitt Growth Advisor</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:3px;">Your access code</div>
    </div>
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1a1a18;margin-bottom:20px;">Here is your one-time access code to start your Growth Fitness assessment:</p>
      <div style="text-align:center;margin:28px 0;">
        <div style="font-size:48px;font-weight:700;letter-spacing:12px;color:#2e6b35;font-family:monospace;">${code}</div>
      </div>
      <p style="font-size:13.5px;color:#5a5c57;line-height:1.6;margin-bottom:0;">This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
    </div>
    <div style="padding:16px 28px;background:#f7f8f6;border-top:1px solid rgba(0,0,0,0.06);">
      <div style="font-size:12px;color:#8a8c87;"><a href="https://growfitt.ai" style="color:#2e6b35;text-decoration:none;">growfitt.ai</a> · <a href="mailto:hello@growfitt.ai" style="color:#2e6b35;text-decoration:none;">hello@growfitt.ai</a></div>
    </div>
  </div>
</body>
</html>`,
        text: `Your GrowFitt access code is: ${code}\n\nThis code expires in 10 minutes.\n\ngrowfitt.ai`,
      });
    } catch (err) {
      console.error("OTP email error:", err);
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to send access code. Please try again." }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Access code sent. Please check your inbox." })
    };
  }

  // ── ACTION: verify OTP ────────────────────────────────────────────────────
  if (action === "verify") {
    if (!email || !otp) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email and code are required." }) };
    }

    const key = email.toLowerCase();
    const record = otpStore.get(key);

    if (!record) {
      return { statusCode: 400, body: JSON.stringify({ error: "No access code found. Please request a new one." }) };
    }
    if (Date.now() > record.expires) {
      otpStore.delete(key);
      return { statusCode: 400, body: JSON.stringify({ error: "Access code has expired. Please request a new one." }) };
    }
    if (record.attempts >= 5) {
      otpStore.delete(key);
      return { statusCode: 400, body: JSON.stringify({ error: "Too many incorrect attempts. Please request a new code." }) };
    }
    if (record.code !== otp.trim()) {
      record.attempts++;
      return { statusCode: 400, body: JSON.stringify({ error: `Incorrect code. ${5 - record.attempts} attempt${5-record.attempts===1?'':'s'} remaining.` }) };
    }

    // Valid — clear the OTP
    otpStore.delete(key);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, verified: true })
    };
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Unknown action." }) };
};
