// app.js
// API Gateway base url (deployed)
// NOTE: API Gateway ApiUrl after latest deployment
const API_URL = "https://9s1ui7uzx9.execute-api.us-east-1.amazonaws.com/Prod";

const form = document.getElementById('subForm');
const msg = document.getElementById('msg');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const data = {
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim() || undefined,
        city: document.getElementById('city').value.trim() || undefined,
        countryCode: document.getElementById('country').value.trim() || undefined
    };

    if (!API_URL || API_URL.includes('REPLACE_WITH_API_URL')) {
        msg.innerHTML = '<span style="color:crimson">Please set the API_URL in app.js before using this UI.</span>';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/subscribe`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const body = await res.json().catch(() => ({}));
        if (res.ok) {
            msg.innerHTML = '<span style="color:green">Subscribed! Check your email for confirmations (if configured).</span>';
            form.reset();
        } else {
            msg.innerHTML = `<span style="color:crimson">Error: ${(body && body.message) || res.statusText}</span>`;
        }
    } catch (err) {
        console.error(err);
        msg.innerHTML = `<span style="color:crimson">Network error: ${err.message}</span>`;
    }
});
