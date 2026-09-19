// Pages Function: POST /api/contact
// Validates input, verifies Cloudflare Turnstile, then sends the message
// via the Resend API to the site owner's inbox.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const name = (data.name || '').toString().trim().slice(0, 100);
  const email = (data.email || '').toString().trim().slice(0, 254);
  const message = (data.message || '').toString().trim().slice(0, 5000);
  const website = (data.website || '').toString(); // honeypot
  const turnstileToken = (data.turnstileToken || '').toString();

  // Honeypot: pretend success for bots.
  if (website) return json({ ok: true });

  if (!name || !email || !message) {
    return json({ error: 'Please fill in your name, email, and message.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'That email address doesn\u2019t look right.' }, 400);
  }
  if (!turnstileToken) {
    return json({ error: 'Please complete the verification check.' }, 400);
  }
  if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY || !env.CONTACT_TO) {
    return json({ error: 'Message service is not configured yet.' }, 503);
  }

  // Verify Turnstile token.
  try {
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
      }),
    });
    const ts = await tsRes.json();
    if (!ts.success) {
      return json({ error: 'Verification failed. Please try again.' }, 400);
    }
  } catch {
    return json({ error: 'Verification failed. Please try again.' }, 400);
  }

  // Send via Resend.
  const to = env.CONTACT_TO;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Contact Form <contact@johnbatchelor.com>',
        to: [to],
        reply_to: email,
        subject: 'Website contact from ' + name,
        text: 'Name: ' + name + '\nEmail: ' + email + '\n\n' + message,
      }),
    });
    if (!res.ok) {
      return json({ error: 'Something went wrong. Please try again later.' }, 502);
    }
  } catch {
    return json({ error: 'Something went wrong. Please try again later.' }, 502);
  }

  return json({ ok: true });
}
