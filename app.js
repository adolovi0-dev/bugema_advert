const $ = (s) => document.querySelector(s);
const LABELS = { lost: 'Lost', found: 'Found', advert: 'Advert', job: 'Job' };
const state = { category: 'all', q: '' };
let posts = [];
let editing = null; // { id } while editing
let editPin = '';

const form = $('#postForm');
const dlg = $('#dlg');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/* ----- READ ----- */
async function load() {
  const p = new URLSearchParams();
  if (state.category !== 'all') p.set('category', state.category);
  if (state.q) p.set('q', state.q);
  try {
    const r = await fetch('/api/posts?' + p);
    if (!r.ok) throw new Error();
    posts = await r.json();
  } catch {
    posts = [];
    alert('Could not load posts. Is the server running?');
  }
  render();
}

function render() {
  $('#empty').hidden = posts.length > 0;
  $('#grid').innerHTML = posts
    .map((p) => {
      const lines = [];
      if (p.organization) lines.push(`🏢 ${esc(p.organization)}`);
      if (p.location) lines.push(`📍 ${esc(p.location)}`);
      if (p.price) lines.push(`💰 ${esc(p.price)}`);
      if (p.deadline) lines.push(`⏰ Apply by ${fmtDate(p.deadline)}`);
      lines.push(`👤 ${esc(p.contactName)}`);
      if (p.contactPhone) lines.push(`📞 ${esc(p.contactPhone)}`);
      if (p.contactEmail) lines.push(`✉️ ${esc(p.contactEmail)}`);
      return `
      <article class="card">
        ${p.hasImage ? `<img loading="lazy" alt="${esc(p.title)}" src="/api/posts/${p._id}/image?v=${encodeURIComponent(p.updatedAt)}">` : ''}
        <div class="body">
          <span class="badge ${p.category}">${LABELS[p.category]}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.description)}</p>
          <div class="meta">${lines.join('<br>')}</div>
          <div class="meta">Posted ${fmtDate(p.createdAt)}</div>
        </div>
        <div class="foot">
          <button class="btn small" data-edit="${p._id}">Edit</button>
          <button class="btn small danger" data-del="${p._id}">Delete</button>
        </div>
      </article>`;
    })
    .join('');
}

/* ----- form helpers ----- */
function toggleFields() {
  const c = form.category.value;
  $('#f-price').hidden = c !== 'advert';
  $('#f-org').hidden = !(c === 'job' || c === 'advert');
  $('#f-deadline').hidden = c !== 'job';
  $('#f-location').hidden = c === 'job';
}
function showError(msg) {
  const e = $('#formError');
  e.textContent = msg || '';
  e.hidden = !msg;
}
function openForm(post, pin) {
  form.reset();
  showError('');
  editing = post ? { id: post._id } : null;
  editPin = pin || '';
  $('#formTitle').textContent = post ? 'Edit post' : 'New post';
  $('#f-remove').hidden = !(post && post.hasImage);
  $('#removeImage').checked = false;
  $('#f-pin').hidden = !!post;
  form.pin.required = !post;
  if (post) {
    ['category', 'title', 'description', 'organization', 'location', 'price', 'contactName', 'contactPhone', 'contactEmail'].forEach((f) => (form[f].value = post[f] || ''));
    form.deadline.value = post.deadline ? post.deadline.slice(0, 10) : '';
  }
  toggleFields();
  dlg.showModal();
}

/* ----- CREATE / UPDATE ----- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const fd = new FormData(form);
  let url = '/api/posts';
  let method = 'POST';
  if (editing) {
    url += '/' + editing.id;
    method = 'PUT';
    fd.set('pin', editPin);
    if ($('#removeImage').checked) fd.set('removeImage', 'true');
  }
  $('#saveBtn').disabled = true;
  try {
    const r = await fetch(url, { method, body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Could not save.');
    dlg.close();
    load();
  } catch (err) {
    showError(err.message);
  } finally {
    $('#saveBtn').disabled = false;
  }
});

/* ----- buttons ----- */
$('#newBtn').addEventListener('click', () => openForm(null));
$('#cancelBtn').addEventListener('click', () => dlg.close());
form.category.addEventListener('change', toggleFields);

$('#grid').addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) {
    const pin = prompt('Enter the PIN you chose when posting:');
    if (!pin) return;
    const post = posts.find((p) => p._id === editId);
    openForm(post, pin);
  }
  if (delId) {
    const pin = prompt('Enter the PIN you chose when posting to delete it:');
    if (!pin) return;
    if (!confirm('Delete this post permanently?')) return;
    const r = await fetch('/api/posts/' + delId, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await r.json();
    if (!r.ok) return alert(data.error || 'Could not delete.');
    load();
  }
});

$('#chips').addEventListener('click', (e) => {
  if (!e.target.dataset.cat) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  e.target.classList.add('active');
  state.category = e.target.dataset.cat;
  load();
});

let timer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.q = e.target.value.trim();
    load();
  }, 300);
});

load();
