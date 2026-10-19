/**
 * Centered Strategy — contact form Worker
 * ------------------------------------------------------------
 * POST / → verify the Turnstile check, email the request to Lauren,
 *          and send the visitor a branded confirmation.
 *
 * The site is static (GitHub Pages), so this Worker holds the secrets.
 *
 * Secrets (wrangler secret put ...):
 *   RESEND_API_KEY    — re_...
 *   TURNSTILE_SECRET  — secret for the "Centered Strategy contact form" widget
 * Vars (wrangler.toml [vars]):
 *   FROM_EMAIL        — sender for the notification to Lauren
 *   CONFIRM_FROM      — sender for the visitor confirmation. Leave empty until
 *                       a domain is verified in Resend; confirmations are
 *                       skipped while it's empty.
 *   TO_EMAIL          — where requests are delivered (comma-separated)
 *   ALLOWED_ORIGINS   — sites allowed to POST here
 */

const SITE = "https://laurenbur2.github.io/centered-strategy";

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, cors);
    return handleForm(request, env, cors);
  },
};

async function handleForm(request, env, cors) {
  let fields = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) {
      fields = await request.json();
    } else {
      const form = await request.formData();
      for (const [k, v] of form.entries()) {
        // checkboxes share a name: collect them into a list
        fields[k] = k in fields ? [].concat(fields[k], v) : v;
      }
    }
  } catch {
    return json({ ok: false, error: "We couldn't read your request." }, 400, cors);
  }

  // Honeypot: real people never fill this hidden field. Pretend success.
  if (fields._gotcha) return json({ ok: true }, 200, cors);

  const name = clean(fields.name);
  const email = clean(fields.email);
  const message = clean(fields.message);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message) {
    return json({ ok: false, error: "Please fill in your name, email, and project details." }, 422, cors);
  }

  // Bot check (Cloudflare Turnstile)
  const human = await verifyTurnstile(fields["cf-turnstile-response"], request, env);
  if (!human) {
    return json({ ok: false, error: "Please complete the verification and try again." }, 403, cors);
  }

  const needs = [].concat(fields.need || []).map(clean).filter(Boolean);
  const data = { name, email, message, needs, website: clean(fields.website) };

  const to = (env.TO_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  const notify = renderNotification(data);
  const sent = await sendEmail(env, {
    from: env.FROM_EMAIL,
    to,
    reply_to: email,
    subject: `New request from ${name}`,
    ...notify,
  });
  if (!sent) {
    return json({ ok: false, error: "We couldn't send your request. Please email lburandt2@gmail.com." }, 502, cors);
  }

  // Confirmation to the visitor (only once a sending domain is verified)
  if (env.CONFIRM_FROM) {
    const confirm = renderConfirmation(data);
    await sendEmail(env, {
      from: env.CONFIRM_FROM,
      to: [email],
      reply_to: to[0],
      subject: "We got your request, thank you",
      ...confirm,
    });
  }

  return json({ ok: true }, 200, cors);
}

async function verifyTurnstile(token, request, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", String(token));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

async function sendEmail(env, payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

// ---- email templates -------------------------------------------------

const C = {
  ink: "#0C1710",
  pine: "#48613C",
  sage: "#6D8959",
  wash: "#E3E5D7",
  cream: "#FBF7F5",
  line: "#E4DFDA",
  soft: "#515A49",
};
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MARK = `${SITE}/assets/logo-mark.png`;

function shell(preheader, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.cream};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;overflow:hidden;">
<tr><td style="padding:28px 36px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding-right:10px;"><img src="${MARK}" width="30" height="30" alt="" style="display:block;"></td>
    <td style="vertical-align:middle;font-family:${SERIF};font-size:20px;color:${C.ink};">centered <span style="font-family:${SANS};font-size:11px;letter-spacing:3px;color:${C.pine};">STRATEGY</span></td>
  </tr></table>
</td></tr>
${inner}
<tr><td style="background:${C.ink};padding:22px 36px;font-family:${SERIF};font-style:italic;font-size:15px;color:#A4B58B;">People at the center. Impact in every direction.</td></tr>
</table>
</td></tr></table></body></html>`;
}

function renderConfirmation({ name, needs, message }) {
  const firstRaw = name.split(/\s+/)[0];
  const first = escapeHtml(firstRaw);
  const IMG = `${SITE}/assets`;
  const F = { serif: SERIF, sans: SANS };
  const excerpt = message.length > 220 ? message.slice(0, 217).trimEnd() + "..." : message;
  const chips = needs.length
    ? `<p style="margin:0 0 14px;">${needs
        .map((n) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 14px;border:1px solid ${C.sage};border-radius:999px;font-family:${F.sans};font-size:12px;letter-spacing:.5px;color:${C.pine};">${escapeHtml(n)}</span>`)
        .join("")}</p>`
    : "";
  const step = (num, label, title, body) => `
      <tr><td style="padding:22px 0;border-top:1px solid ${C.line};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="56" style="vertical-align:top;font-family:${F.serif};font-style:italic;font-variant-numeric:lining-nums;font-size:30px;line-height:1;color:${C.sage};">${num}</td>
          <td style="vertical-align:top;">
            <p style="margin:0 0 4px;font-family:${F.sans};font-size:10px;letter-spacing:3px;color:${C.sage};">${label}</p>
            <p style="margin:0 0 6px;font-family:${F.serif};font-size:22px;line-height:1.2;color:${C.ink};">${title}</p>
            <p style="margin:0;font-family:${F.sans};font-size:14px;line-height:1.65;color:${C.soft};">${body}</p>
          </td>
        </tr></table>
      </td></tr>`;
  const stat = (num, label) => `
      <td width="33%" align="center" style="padding:6px 8px;vertical-align:top;">
        <p style="margin:0;font-family:${F.serif};font-size:30px;line-height:1;color:${C.cream};font-variant-numeric:lining-nums;">${num}</p>
        <p style="margin:8px 0 0;font-family:${F.sans};font-size:11px;line-height:1.45;color:#A4B58B;">${label}</p>
      </td>`;

  const inner = `
<!-- hero -->
<tr><td background="${IMG}/email-hero.jpg" bgcolor="${C.ink}" style="background:${C.ink} url('${IMG}/email-hero.jpg') center/cover no-repeat;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(12,23,16,.62);"><tr><td align="center" style="padding:56px 36px 60px;">
    <p style="margin:0;font-family:${F.serif};font-size:24px;color:${C.cream};">centered <span style="font-family:${F.sans};font-size:11px;letter-spacing:4px;color:#A4B58B;">STRATEGY</span></p>
    <p style="margin:26px 0 0;font-family:${F.sans};font-size:10px;letter-spacing:4px;color:#A4B58B;">REQUEST RECEIVED</p>
    <p style="margin:10px 0 0;font-family:${F.serif};font-style:italic;font-size:44px;line-height:1.05;color:${C.cream};">Thank you, ${first}.</p>
    <p style="margin:14px auto 0;max-width:380px;font-family:${F.sans};font-size:14px;line-height:1.6;color:rgba(251,247,245,.85);">Your request is with us. We'll reply personally within two business days.</p>
  </td></tr></table>
</td></tr>

<!-- intro -->
<tr><td align="center" style="padding:48px 44px 8px;">
  <p style="margin:0 0 14px;font-family:${F.sans};font-size:10px;letter-spacing:4px;color:${C.sage};">PEOPLE AT THE CENTER</p>
  <p style="margin:0 0 18px;font-family:${F.serif};font-style:italic;font-size:26px;line-height:1.3;color:${C.ink};">Every great brand starts with someone willing to say what they're building.</p>
  <p style="margin:0;font-family:${F.sans};font-size:15px;line-height:1.75;color:${C.soft};">We read every request ourselves, look at where you are today, and come to the call with ideas, not a sales script.</p>
</td></tr>

<!-- their request -->
<tr><td style="padding:32px 44px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.wash};border-radius:12px;"><tr><td style="padding:26px 28px;">
    <p style="margin:0 0 14px;font-family:${F.sans};font-size:10px;letter-spacing:4px;color:${C.pine};">WHAT YOU SHARED</p>
    ${chips}
    <p style="margin:0;font-family:${F.serif};font-style:italic;font-size:18px;line-height:1.5;color:${C.ink};">&ldquo;${escapeHtml(excerpt)}&rdquo;</p>
  </td></tr></table>
</td></tr>

<!-- next steps -->
<tr><td style="padding:40px 44px 12px;">
  <p style="margin:0 0 6px;font-family:${F.sans};font-size:10px;letter-spacing:4px;color:${C.sage};text-align:center;">WHAT HAPPENS NEXT</p>
  <p style="margin:0 0 22px;font-family:${F.serif};font-size:30px;line-height:1.2;color:${C.ink};text-align:center;">Simple from here.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${step("I", "WITHIN 2 BUSINESS DAYS", "We review your request", "We look at your brand, your audience, and what you want to grow.")}
    ${step("II", "30 MINUTES, FREE", "A conversation, not a pitch", "We talk through your goals and give you a clear read on where to start.")}
    ${step("III", "IN PLAIN LANGUAGE", "A clear plan and quote", "Scope, timeline, and a fixed price, so you know exactly what you're getting.")}
  </table>
</td></tr>

<!-- founder -->
<tr><td style="padding:28px 0 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.wash};"><tr>
    <td width="46%" style="vertical-align:top;"><img src="${IMG}/lauren.jpg" width="100%" alt="Lauren Burandt" style="display:block;width:100%;height:auto;"></td>
    <td style="vertical-align:middle;padding:24px 28px;">
      <p style="margin:0 0 8px;font-family:${F.sans};font-size:10px;letter-spacing:4px;color:${C.pine};">YOUR STRATEGIST</p>
      <p style="margin:0 0 10px;font-family:${F.serif};font-size:26px;line-height:1.1;color:${C.ink};">Lauren Burandt</p>
      <p style="margin:0;font-family:${F.sans};font-size:13px;line-height:1.65;color:${C.soft};">Founder of Centered Strategy. Grows founder and wellness brands on social, and builds the websites and systems behind them.</p>
    </td>
  </tr></table>
</td></tr>

<!-- proof -->
<tr><td style="background:${C.ink};padding:34px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${stat("370K+", "followers grown organically")}
    ${stat("265K", "for Bonetti Explosives, from 500")}
    ${stat("5 yrs", "building founder brands")}
  </tr></table>
</td></tr>

<!-- work -->
<tr><td style="padding:44px 44px 12px;" align="center">
  <p style="margin:0 0 6px;font-family:${F.sans};font-size:10px;letter-spacing:4px;color:${C.sage};">WHILE YOU WAIT</p>
  <p style="margin:0 0 22px;font-family:${F.serif};font-size:30px;line-height:1.2;color:${C.ink};">A look at the work.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="padding-right:6px;vertical-align:top;"><img src="${IMG}/proj-tigersoul.jpg" width="100%" alt="Tiger Soul website" style="display:block;width:100%;height:auto;border-radius:8px;"></td>
    <td width="50%" style="padding-left:6px;vertical-align:top;"><img src="${IMG}/proj-casa.jpg" width="100%" alt="Casa da Nova Vida website" style="display:block;width:100%;height:auto;border-radius:8px;"></td>
  </tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;"><tr><td style="background:${C.pine};border-radius:999px;">
    <a href="${SITE}/projects.html" style="display:inline-block;padding:14px 30px;font-family:${F.sans};font-size:12px;letter-spacing:2px;font-weight:600;color:${C.cream};text-decoration:none;">SEE THE WORK</a>
  </td></tr></table>
</td></tr>

<!-- sign-off -->
<tr><td align="center" style="padding:36px 44px 44px;">
  <p style="margin:0 0 18px;font-family:${F.sans};font-size:14px;line-height:1.7;color:${C.soft};">Anything to add before we talk? Just reply to this email.</p>
  <p style="margin:0;font-family:${F.serif};font-style:italic;font-size:24px;color:${C.ink};">Lauren</p>
  <p style="margin:4px 0 0;font-family:${F.sans};font-size:10px;letter-spacing:3px;color:${C.sage};">CENTERED STRATEGY</p>
</td></tr>`;

  const text = `Thank you, ${firstRaw}.

Your request is with us. We'll reply personally within two business days.
${needs.length ? `\nYou mentioned: ${needs.join(", ")}\n` : ""}
What happens next
I.   We review your request (within 2 business days)
II.  A free 30-minute conversation, not a pitch
III. A clear plan and quote, in plain language

See the work: ${SITE}/projects.html

Anything to add before we talk? Just reply to this email.

Lauren
Centered Strategy`;
  return { html: emailFrame("Your request is with us. We'll reply within two business days.", inner), text };
}

// Full-bleed frame for the client-facing confirmation
function emailFrame(preheader, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#F3EEE9;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EEE9;padding:28px 10px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.cream};border-radius:14px;overflow:hidden;">
${inner}
<tr><td align="center" style="background:${C.ink};padding:30px 36px;">
  <p style="margin:0 0 6px;font-family:${SERIF};font-size:20px;color:${C.cream};">centered <span style="font-family:${SANS};font-size:10px;letter-spacing:4px;color:#A4B58B;">STRATEGY</span></p>
  <p style="margin:0 0 16px;font-family:${SERIF};font-style:italic;font-size:15px;color:#A4B58B;">People at the center. Impact in every direction.</p>
  <p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:1px;color:rgba(251,247,245,.6);">
    <a href="${SITE}/services.html" style="color:rgba(251,247,245,.75);text-decoration:none;">Services</a> &nbsp;&middot;&nbsp;
    <a href="${SITE}/projects.html" style="color:rgba(251,247,245,.75);text-decoration:none;">Work</a> &nbsp;&middot;&nbsp;
    <a href="${SITE}/about.html" style="color:rgba(251,247,245,.75);text-decoration:none;">About</a>
  </p>
</td></tr>
</table>
<p style="margin:18px 0 0;font-family:${SANS};font-size:11px;color:#8C8A84;">You're receiving this because you sent a request on our website.</p>
</td></tr></table></body></html>`;
}

function renderNotification({ name, email, message, needs, website }) {
  const row = (label, value) => `
    <tr><td style="padding:12px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:11px;letter-spacing:2px;color:${C.sage};vertical-align:top;width:130px;">${label}</td>
    <td style="padding:12px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink};">${value}</td></tr>`;
  const inner = `
<tr><td style="padding:30px 36px 8px;">
  <p style="margin:0 0 10px;font-family:${SANS};font-size:11px;letter-spacing:3px;color:${C.sage};">NEW REQUEST</p>
  <h1 style="margin:0 0 18px;font-family:${SERIF};font-weight:500;font-size:30px;line-height:1.15;color:${C.ink};">${escapeHtml(name)} wants to talk.</h1>
</td></tr>
<tr><td style="padding:0 36px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row("EMAIL", `<a href="mailto:${escapeHtml(email)}" style="color:${C.pine};">${escapeHtml(email)}</a>`)}
    ${row("NEEDS", needs.length ? needs.map(escapeHtml).join(", ") : "Not specified")}
    ${website ? row("WEBSITE / IG", escapeHtml(website)) : ""}
    ${row("PROJECT", escapeHtml(message).replace(/\n/g, "<br>"))}
  </table>
</td></tr>
<tr><td style="padding:18px 36px 32px;">
  <a href="mailto:${escapeHtml(email)}" style="display:inline-block;background:${C.pine};color:${C.cream};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;padding:13px 24px;border-radius:999px;">Reply to ${escapeHtml(name.split(/\s+/)[0])}</a>
</td></tr>`;
  const text = `New request from ${name}
Email: ${email}
Needs: ${needs.join(", ") || "Not specified"}${website ? `\nWebsite / IG: ${website}` : ""}

${message}`;
  return { html: shell(`${name}: ${message.slice(0, 80)}`, inner), text };
}

// ---- helpers ---------------------------------------------------------

function clean(v) {
  return String(v ?? "").trim().slice(0, 5000);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}
