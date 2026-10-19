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

function renderConfirmation({ name, needs }) {
  const first = escapeHtml(name.split(/\s+/)[0]);
  const needLine = needs.length
    ? `<p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.soft};">You mentioned: <strong style="color:${C.ink};font-weight:600;">${needs.map(escapeHtml).join(", ")}</strong>.</p>`
    : "";
  const step = (n, title, body) => `
    <tr><td style="padding:14px 0;border-top:1px solid ${C.line};vertical-align:top;width:34px;font-family:${SERIF};font-size:20px;color:${C.sage};">${n}</td>
    <td style="padding:14px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:14px;line-height:1.55;color:${C.soft};"><strong style="display:block;font-family:${SERIF};font-size:18px;font-weight:500;color:${C.ink};margin-bottom:2px;">${title}</strong>${body}</td></tr>`;
  const inner = `
<tr><td style="padding:30px 36px 8px;">
  <p style="margin:0 0 10px;font-family:${SANS};font-size:11px;letter-spacing:3px;color:${C.sage};">REQUEST RECEIVED</p>
  <h1 style="margin:0 0 16px;font-family:${SERIF};font-weight:500;font-size:34px;line-height:1.1;color:${C.ink};">Thank you, ${first}. <em style="color:${C.pine};">We got it.</em></h1>
  <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.soft};">Thanks for telling us about what you're building. We read every request personally and will reply within two business days.</p>
  ${needLine}
</td></tr>
<tr><td style="padding:0 36px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${step("01", "We review your request", "We look at your brand, your goals, and where you are today.")}
    ${step("02", "A free 30-minute call", "No pitch. Just a clear read on where to start.")}
    ${step("03", "A clear plan and quote", "Scope, timeline, and a fixed price, in plain language.")}
  </table>
</td></tr>
<tr><td style="padding:18px 36px 32px;">
  <a href="${SITE}/projects.html" style="display:inline-block;background:${C.pine};color:${C.cream};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;padding:13px 24px;border-radius:999px;">See our work while you wait</a>
  <p style="margin:24px 0 0;font-family:${SERIF};font-style:italic;font-size:19px;color:${C.ink};">Lauren Burandt</p>
  <p style="margin:2px 0 0;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${C.sage};">FOUNDER, CENTERED STRATEGY</p>
</td></tr>`;
  const text = `Thank you, ${name.split(/\s+/)[0]}. We got your request.

We read every request personally and will reply within two business days.${needs.length ? `\nYou mentioned: ${needs.join(", ")}.` : ""}

What happens next:
01 We review your request
02 A free 30-minute call
03 A clear plan and quote

See our work: ${SITE}/projects.html

Lauren Burandt
Founder, Centered Strategy`;
  return { html: shell("We got your request and will reply within two business days.", inner), text };
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
