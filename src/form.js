// Sends the signup form to a Google Apps Script web app that appends a row to a Sheet.
// The endpoint comes from VITE_SHEETS_URL and the group invite from VITE_WHATSAPP_GROUP_URL (see .env.example).
// Trim and drop a stray leading "=" (e.g. "VITE_SHEETS_URL==https://…" pasted into Railway),
// which would turn it into a relative path posting to our own domain.
const ENDPOINT = (import.meta.env.VITE_SHEETS_URL || '').trim().replace(/^=+/, '');
const GROUP_URL = import.meta.env.VITE_WHATSAPP_GROUP_URL;

const form = document.getElementById('signup');
const success = document.getElementById('success');
document.getElementById('whatsapp-link').href = GROUP_URL || '#';
const statusEl = form.querySelector('.status');
const button = form.querySelector('button');
const phone = form.elements.whatsapp;

// Brazilian phone mask: (11) 98765-4321 / (11) 3456-7890
function maskPhone(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
phone.addEventListener('input', () => { phone.value = maskPhone(phone.value); });

const checks = {
  nome: (v) => v.trim().length >= 2 || 'Informe seu nome.',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Informe um e-mail válido.',
  whatsapp: (v) => /^\d{10,11}$/.test(v.replace(/\D/g, '')) || 'Informe um WhatsApp com DDD.',
  termos: (_, input) => input.checked || 'Você precisa concordar com os termos e condições.',
};

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

for (const name of Object.keys(checks)) {
  const clear = (e) => e.target.removeAttribute('aria-invalid');
  form.elements[name].addEventListener('input', clear);
  form.elements[name].addEventListener('change', clear);
}

function showSuccess() {
  form.hidden = true;
  success.hidden = false;
  success.focus({ preventScroll: true });
  success.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  let firstError = null;
  for (const [name, check] of Object.entries(checks)) {
    const input = form.elements[name];
    const result = check(input.value, input);
    if (result !== true) {
      input.setAttribute('aria-invalid', 'true');
      firstError ??= { input, message: result };
    }
  }
  if (firstError) {
    setStatus(firstError.message, true);
    firstError.input.focus();
    return;
  }
  if (!ENDPOINT) {
    setStatus('Formulário ainda não configurado (VITE_SHEETS_URL).', true);
    return;
  }

  const body = new URLSearchParams({
    nome: form.elements.nome.value.trim(),
    email: form.elements.email.value.trim(),
    whatsapp: form.elements.whatsapp.value.trim(),
    termos: 'sim',
    website: form.elements.website.value, // honeypot
    origem: location.href,
  });

  button.disabled = true;
  setStatus('Enviando…');
  try {
    // Apps Script doesn't send CORS headers on the redirect, so the response is opaque.
    await fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body });
    // GTM: use a Custom Event trigger on "signup_submit" to track conversions.
    (window.dataLayer = window.dataLayer || []).push({ event: 'signup_submit' });
    form.reset();
    setStatus('');
    showSuccess();
  } catch {
    setStatus('Não foi possível enviar. Tente novamente.', true);
  } finally {
    button.disabled = false;
  }
});
