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

const SITE = "https://centeredstrategy.com";

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

function renderConfirmation({ name }) {
  const firstRaw = name.split(/\s+/)[0];
  const first = escapeHtml(firstRaw);
  const IMG = `${SITE}/assets`;
  const work = (img, alt, tag, title) => `
      <td width="50%" style="vertical-align:top;padding:0 7px;">
        <a href="${SITE}/projects.html" style="text-decoration:none;">
          <img src="${IMG}/${img}" width="100%" alt="${alt}" style="display:block;width:100%;height:auto;border-radius:10px;">
          <p style="margin:12px 0 2px;font-family:${SANS};font-size:9px;letter-spacing:3px;color:${C.sage};">${tag}</p>
          <p style="margin:0;font-family:${SERIF};font-size:18px;line-height:1.25;color:${C.ink};">${title}</p>
        </a>
      </td>`;

  const inner = `
<!-- hero -->
<tr><td background="${IMG}/email-hero.jpg" bgcolor="${C.ink}" style="background:${C.ink} url('${IMG}/email-hero.jpg') center/cover no-repeat;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(12,23,16,.45);"><tr><td align="center" style="padding:44px 36px 68px;">
    <p style="margin:0;font-family:${SERIF};font-size:22px;color:${C.cream};">centered <span style="font-family:${SANS};font-size:10px;letter-spacing:4px;color:#A4B58B;">STRATEGY</span></p>
    <p style="margin:58px 0 0;font-family:${SANS};font-size:10px;letter-spacing:5px;color:#A4B58B;">REQUEST RECEIVED</p>
    <p style="margin:14px 0 0;font-family:${SERIF};font-style:italic;font-size:52px;line-height:1;color:${C.cream};">Thank you, ${first}.</p>
  </td></tr></table>
</td></tr>

<!-- message -->
<tr><td align="center" style="padding:46px 52px 40px;">
  <p style="margin:0 0 18px;font-family:${SERIF};font-size:24px;line-height:1.35;color:${C.ink};">Your request is with us.</p>
  <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.75;color:${C.soft};">We read every request personally and will be in touch within two business days to set up a time to talk.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto 0;"><tr><td style="border-top:1px solid ${C.sage};width:40px;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<!-- work -->
<tr><td style="padding:0 37px 8px;">
  <p style="margin:0 0 4px;font-family:${SANS};font-size:10px;letter-spacing:5px;color:${C.sage};text-align:center;">WHILE YOU WAIT</p>
  <p style="margin:0 0 26px;font-family:${SERIF};font-size:30px;line-height:1.2;color:${C.ink};text-align:center;">A look at the work.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${work("proj-tigersoul.jpg", "Tiger Soul website", "WEBSITE", "Tiger Soul")}
    ${work("proj-casa.jpg", "Casa da Nova Vida website", "WEBSITE", "Casa da Nova Vida")}
  </tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:34px auto 0;"><tr><td style="background:${C.pine};border-radius:999px;">
    <a href="${SITE}/projects.html" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:11px;letter-spacing:3px;font-weight:600;color:${C.cream};text-decoration:none;">SEE ALL WORK</a>
  </td></tr></table>
</td></tr>

<!-- sign-off -->
<tr><td align="center" style="padding:42px 44px 46px;">
  <p style="margin:0;font-family:${SERIF};font-style:italic;font-size:22px;color:${C.ink};">Lauren</p>
  <p style="margin:4px 0 0;font-family:${SANS};font-size:9px;letter-spacing:4px;color:${C.sage};">CENTERED STRATEGY</p>
</td></tr>`;

  const text = `Thank you, ${firstRaw}.

Your request is with us. We read every request personally and will be in touch within two business days to set up a time to talk.

While you wait, a look at the work: ${SITE}/projects.html

Lauren
Centered Strategy`;
  return { html: emailFrame("Your request is with us. We'll be in touch within two business days.", inner), text };
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
