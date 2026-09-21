const REPO = 'AlbertoBrown/baldios-media';
const API = 'https://api.github.com';
const categories = [
  ['sonda-veeder','Sonda Veeder','Sondas y lecturas Veeder-Root'],
  ['proconsi','Proconsi','Capturas y referencias Proconsi'],
  ['camiones','Camiones','Vehículos, cubas e incidencias'],
  ['gasocentro','Gasocentro','Instalación y depósitos'],
  ['instalaciones','Instalaciones','Equipos y zonas de trabajo'],
  ['otros','Otros','Material sin categoría específica']
];

const els = {
  token: document.getElementById('token'),
  rememberToken: document.getElementById('rememberToken'),
  toggleToken: document.getElementById('toggleToken'),
  testConnection: document.getElementById('testConnection'),
  connectionStatus: document.getElementById('connectionStatus'),
  cameraInput: document.getElementById('cameraInput'),
  galleryInput: document.getElementById('galleryInput'),
  previewWrap: document.getElementById('previewWrap'),
  preview: document.getElementById('preview'),
  fileInfo: document.getElementById('fileInfo'),
  category: document.getElementById('category'),
  title: document.getElementById('title'),
  notes: document.getElementById('notes'),
  uploadSummary: document.getElementById('uploadSummary'),
  uploadButton: document.getElementById('uploadButton'),
  progress: document.getElementById('progress'),
  progressText: document.getElementById('progressText'),
  toast: document.getElementById('toast'),
  categoryGrid: document.getElementById('categoryGrid')
};

let currentFile = null;
let previewUrl = null;

const remembered = localStorage.getItem('baldiosMediaToken');
if (remembered) {
  els.token.value = remembered;
  els.rememberToken.checked = true;
}

function showToast(message, timeout = 3200) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => els.toast.classList.add('hidden'), timeout);
}

function cleanSlug(value) {
  return (value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,50);
}

function prettyBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

function updateSummary() {
  if (!currentFile) {
    els.uploadSummary.textContent = 'Selecciona una foto para continuar.';
    els.uploadButton.disabled = true;
    return;
  }
  const categoryName = categories.find(c => c[0] === els.category.value)?.[1] || els.category.value;
  els.uploadSummary.textContent = `Se guardará en “${categoryName}”, organizada por año y mes.`;
  els.uploadButton.disabled = false;
}

function selectFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Selecciona una imagen válida.');
    return;
  }
  currentFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  els.preview.src = previewUrl;
  els.previewWrap.classList.remove('hidden');
  els.fileInfo.textContent = `${file.name || 'Foto'} · ${prettyBytes(file.size)}`;
  updateSummary();
}

els.cameraInput.addEventListener('change', e => selectFile(e.target.files?.[0]));
els.galleryInput.addEventListener('change', e => selectFile(e.target.files?.[0]));
els.category.addEventListener('change', updateSummary);

els.toggleToken.addEventListener('click', () => {
  const visible = els.token.type === 'text';
  els.token.type = visible ? 'password' : 'text';
  els.toggleToken.textContent = visible ? 'Ver' : 'Ocultar';
});

els.rememberToken.addEventListener('change', () => {
  if (els.rememberToken.checked && els.token.value.trim()) {
    localStorage.setItem('baldiosMediaToken', els.token.value.trim());
  } else {
    localStorage.removeItem('baldiosMediaToken');
  }
});

els.token.addEventListener('input', () => {
  if (els.rememberToken.checked) localStorage.setItem('baldiosMediaToken', els.token.value.trim());
});

async function githubFetch(path, options = {}) {
  const token = els.token.value.trim();
  if (!token) throw new Error('Falta el token de GitHub.');
  const response = await fetch(API + path, {
    ...options,
    headers: {
      'Accept':'application/vnd.github+json',
      'Authorization':`Bearer ${token}`,
      'X-GitHub-Api-Version':'2022-11-28',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).message || ''; } catch {}
    throw new Error(detail || `GitHub respondió ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

els.testConnection.addEventListener('click', async () => {
  try {
    els.connectionStatus.textContent = 'Comprobando…';
    const repo = await githubFetch('/repos/' + REPO);
    els.connectionStatus.textContent = 'GitHub conectado';
    if (els.rememberToken.checked) localStorage.setItem('baldiosMediaToken', els.token.value.trim());
    showToast('Conexión correcta con ' + repo.full_name);
  } catch (e) {
    els.connectionStatus.textContent = 'Sin conexión';
    showToast('No se pudo conectar: ' + e.message, 5000);
  }
});

function getOriginalExtension(file) {
  const byName = (file.name || '').split('.').pop()?.toLowerCase();
  if (byName && /^[a-z0-9]{2,5}$/.test(byName)) return byName;

  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif'
  };
  return mimeMap[file.type] || 'img';
}

async function compressImage(file) {
  try {
    if (typeof createImageBitmap !== 'function') {
      throw new Error('El navegador no permite comprimir esta imagen.');
    }

    const bitmap = await createImageBitmap(file);
    const max = 2200;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen.');

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.84)
    );

    if (!blob) throw new Error('No se pudo comprimir la imagen.');

    return {
      blob,
      extension: 'jpg',
      mime: 'image/jpeg',
      compressed: true
    };
  } catch (error) {
    console.warn('No se pudo comprimir. Se subirá el archivo original.', error);

    return {
      blob: file,
      extension: getOriginalExtension(file),
      mime: file.type || 'application/octet-stream',
      compressed: false
    };
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function localStamp(d = new Date()) {
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

els.uploadButton.addEventListener('click', async () => {
  if (!currentFile) return;
  if (!els.token.value.trim()) {
    showToast('Añade primero tu token de GitHub.');
    els.token.focus();
    return;
  }

  els.uploadButton.disabled = true;
  els.progress.classList.remove('hidden');

  try {
    els.progressText.textContent = 'Preparando imagen…';
    const preparedImage = await compressImage(currentFile);

    if (!preparedImage.compressed) {
      els.progressText.textContent = 'Formato original detectado · se subirá sin comprimir…';
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth()+1).padStart(2,'0');
    const titleSlug = cleanSlug(els.title.value) || 'foto';
    const filename = `${localStamp(now)}_${titleSlug}.${preparedImage.extension}`;
    const path = `media/${els.category.value}/${year}/${month}/${filename}`;

    els.progressText.textContent = 'Preparando subida…';
    const content = await blobToBase64(preparedImage.blob);

    const note = els.notes.value.trim();
    const commitMessage = `Añadir foto · ${categories.find(c=>c[0]===els.category.value)?.[1] || els.category.value}${els.title.value.trim() ? ' · ' + els.title.value.trim() : ''}`;

    els.progressText.textContent = 'Subiendo a GitHub…';
    const result = await githubFetch('/repos/' + REPO + '/contents/' + path, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        message: commitMessage,
        content,
        branch: 'main'
      })
    });

    if (note) {
      const metaPath = path.replace(/\.jpg$/i,'.json');
      const meta = {
        title: els.title.value.trim(),
        notes: note,
        category: els.category.value,
        created_at: now.toISOString(),
        image: filename
      };
      const metaContent = btoa(unescape(encodeURIComponent(JSON.stringify(meta,null,2))));
      await githubFetch('/repos/' + REPO + '/contents/' + metaPath, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          message:'Añadir notas · ' + filename,
          content:metaContent,
          branch:'main'
        })
      });
    }

    els.connectionStatus.textContent = 'Subida completada';
    showToast('Foto subida correctamente ✅', 4200);

    currentFile = null;
    els.cameraInput.value = '';
    els.galleryInput.value = '';
    els.title.value = '';
    els.notes.value = '';
    els.previewWrap.classList.add('hidden');
    updateSummary();

    if (result?.content?.html_url) {
      els.uploadSummary.innerHTML = 'Subida completada. <a href="' + result.content.html_url + '" target="_blank" rel="noopener">Ver archivo en GitHub ↗</a>';
    }
  } catch (e) {
    els.connectionStatus.textContent = 'Error al subir';
    showToast('Error: ' + e.message, 6000);
    els.uploadButton.disabled = false;
  } finally {
    els.progress.classList.add('hidden');
    if (currentFile) els.uploadButton.disabled = false;
  }
});

els.categoryGrid.innerHTML = categories.map(([slug,name,desc]) => `
  <a class="category-link" href="https://github.com/${REPO}/tree/main/media/${slug}" target="_blank" rel="noopener">
    ${name}
    <small>${desc}</small>
  </a>
`).join('');
