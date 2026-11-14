const form = document.querySelector('#login-form');
const button = document.querySelector('#login-submit');
const feedback = document.querySelector('#login-feedback');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  feedback.hidden = true;
  try {
    const response = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Belum dapat masuk. Coba lagi.');
    form.elements.password.value = '';
    location.replace('/');
  } catch (error) {
    feedback.textContent = error.message || 'Server belum dapat diakses. Coba lagi.';
    feedback.hidden = false;
    button.disabled = false;
  }
});
