const authState = document.getElementById('authState');
const appCard = document.getElementById('appCard');
const planText = document.getElementById('planText');

async function api(url, method='GET', body) {
  const res = await fetch(url, { method, headers: body instanceof FormData ? {} : { 'Content-Type':'application/json' }, body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

async function register(){
  try { await api('/api/register','POST',{ email:email.value, password:password.value }); alert('Registered.'); }
  catch(e){ alert(e.message); }
}
async function login(){
  try { await api('/api/login','POST',{ email:email.value, password:password.value }); await refresh(); }
  catch(e){ alert(e.message); }
}
async function logout(){ try { await api('/api/logout','POST'); await refresh(); } catch(e){ alert(e.message);} }

async function createFolder(){
  try { await api('/api/folders','POST',{ name: folderName.value }); folderName.value=''; await refreshFiles(); }
  catch(e){ alert(e.message); }
}

async function uploadFile(){
  const file = fileInput.files[0];
  if (!file) return alert('Choose a file');
  const fd = new FormData();
  fd.append('document', file);
  fd.append('visibility', visibility.value);
  if (folderSelect.value) fd.append('folderId', folderSelect.value);
  try { await api('/api/upload', 'POST', fd); fileInput.value=''; await refreshFiles(); }
  catch(e){ alert(e.message); }
}

async function checkout(){ try{ const d = await api('/api/subscription/checkout','POST'); alert(d.message); }catch(e){alert(e.message);} }
async function activatePro(){ try{ await api('/api/subscription/activate-pro','POST'); await refresh(); }catch(e){alert(e.message);} }

function formatBytes(b){ if (b > 1e9) return (b/1e9).toFixed(2)+' GB'; if (b>1e6) return (b/1e6).toFixed(2)+' MB'; return b+' B'; }

async function refreshFiles(){
  const data = await api('/api/files');
  folderSelect.innerHTML = '<option value="">No folder</option>' + data.folders.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
  mine.innerHTML = data.mine.map(f=>`<li>${f.original_name} · ${formatBytes(f.size_bytes)} · ${f.visibility} · <a href="/api/download/${f.id}">Download</a></li>`).join('');
  public.innerHTML = data.publicFiles.map(f=>`<li>${f.original_name} by ${f.owner_email} · <a href="/api/download/${f.id}">Download</a></li>`).join('');
}

async function refresh(){
  const { user } = await api('/api/me');
  if (!user) { authState.textContent='Not logged in.'; appCard.classList.add('hidden'); return; }
  authState.textContent = `Logged in as ${user.email}`;
  const limit = user.unrestricted ? 'Unlimited threshold' : (user.plan === 'pro' ? '3GB transfer limit + any file type' : '1GB transfer limit + restricted file types');
  planText.textContent = `Plan: ${user.plan.toUpperCase()} | ${limit}`;
  appCard.classList.remove('hidden');
  await refreshFiles();
}

refresh();
