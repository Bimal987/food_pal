import { fetchWithAuth, getUser } from './api.js';
import { renderNavbar, requireAuth } from './auth.js';
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from './image-utils.js';

function getId() {
  const url = new URL(window.location.href);
  return parseInt(url.searchParams.get('id'), 10);
}

function el(id) { return document.getElementById(id); }

function updateGuestHints() {
  const user = getUser();
  const favHint = el('favLoginHint');
  if (favHint) {
    favHint.classList.toggle('hidden', !!user);
  }
}

function displayIngredientName(name) {
  if (!name) return '';
  return String(name)
    .replace(/^[\s"'\\[\(]+/, '')
    .replace(/[\s"'\]\\\)]+$/, '')
    .trim();
}

function renderIngredients(list) {
  return list
    .map(i => `<li class="py-1">&bull; ${displayIngredientName(i.name)}</li>`)
    .join('');
}

function renderSteps(stepsText) {
  if (!stepsText) return '';
  // If steps contain numbered pattern, keep; else split lines
  const parts = stepsText.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return `<p class="text-slate-700 whitespace-pre-line">${stepsText}</p>`;
  return `<ol class="list-decimal pl-6 space-y-2">${parts.map(p => `<li class="text-slate-700">${p}</li>`).join('')}</ol>`;
}

async function loadRecipe() {
  const id = getId();
  if (!id) { el('content').textContent = 'Invalid recipe id'; return; }

  el('content').classList.remove('hidden');
  el('loading').classList.remove('hidden');

  try {
    const recipe = await fetchWithAuth(`/api/recipes/${id}`);
    el('title').textContent = recipe.title;
    
    // Update IDs for granular meta
    if(el('cuisinebadge')) el('cuisinebadge').textContent = recipe.cuisine || 'Generic';
    if(el('levelbadge')) el('levelbadge').textContent = recipe.difficulty || 'Medium';
    if(el('vegbadge')) {
        el('vegbadge').textContent = recipe.veg_type === 'non-veg' ? 'Non-Veg' : 'Veg';
        el('vegbadge').className = recipe.veg_type === 'non-veg' 
            ? 'px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-100' 
            : 'px-3 py-1 rounded-full bg-green-50 text-green-600 border border-green-100';
    }
    if(el('time')) el('time').textContent = recipe.cook_time + ' min';

    el('desc').textContent = recipe.description || '';
    el('avg').textContent = recipe.avg_rating ? `${recipe.avg_rating} (${recipe.ratings_count})` : 'Not rated';
    
    const imageUrl = normalizeImageUrl(recipe.image_url);
    const imageSources = buildImageSources({ url: imageUrl, title: recipe.title, id: recipe.id, width: 800, height: 600 });
    if (imageSources.length) {
      const img = el('img');
      img.src = imageSources[0];
      img.setAttribute('data-src', imageUrl || '');
      img.setAttribute('data-title', recipe.title || '');
      img.setAttribute('data-id', recipe.id || '');
      img.setAttribute('data-fallback', 'recipe');
      img.classList.remove('hidden');
      if(el('imgPlaceholder')) el('imgPlaceholder').classList.add('hidden');
      attachImageFallbacks(img.parentElement || document);
    } else {
      el('img').classList.add('hidden');
      if(el('imgPlaceholder')) el('imgPlaceholder').classList.remove('hidden');
    }

    el('ingredients').innerHTML = renderIngredients(recipe.ingredients || []);
    el('steps').innerHTML = renderSteps(recipe.steps || '');

    await loadUserRating(id);
    await loadRatingsList(id);
    await loadRecommendations(id);
  } catch (err) {
    el('content').textContent = err.message;
  } finally {
    el('loading').classList.add('hidden');
  }
}

let currentRating = 5;

function setStarSelection(value) {
  currentRating = value;
  const buttons = document.querySelectorAll('#starPicker .star-btn');
  buttons.forEach(btn => {
    const v = parseInt(btn.dataset.value, 10);
    if (v <= value) {
      btn.classList.remove('text-slate-300');
      btn.classList.add('text-amber-400');
    } else {
      btn.classList.add('text-slate-300');
      btn.classList.remove('text-amber-400');
    }
  });
  const label = el('ratingLabel');
  if (label) label.textContent = `${value} / 5 Stars`;
}

function bindStarPicker() {
  const buttons = document.querySelectorAll('#starPicker .star-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = parseInt(btn.dataset.value, 10);
      setStarSelection(v);
    });
  });
  setStarSelection(currentRating);
}

async function loadUserRating(recipeId) {
  const user = getUser();
  if (!user) {
    el('ratingBox').classList.add('hidden');
    el('loginHint').classList.remove('hidden');
    return;
  }
  el('ratingBox').classList.remove('hidden');
  el('loginHint').classList.add('hidden');

  try {
    const r = await fetchWithAuth(`/api/ratings/${recipeId}`);
    if (r) {
      setStarSelection(r.rating);
      el('review').value = r.review || '';
      el('ratingStatus').textContent = 'Your rating loaded. You can update it.';
    } else {
      el('ratingStatus').textContent = 'No rating yet. Add one!';
    }
  } catch (err) {
    // ignore
  }
}

async function submitRating(isUpdate) {
  const id = getId();
  const rating = currentRating;
  const review = el('review').value.trim();
  el('ratingStatus').textContent = 'Saving...';

  try {
    await fetchWithAuth(`/api/ratings/${id}`, {
      method: isUpdate ? 'PUT' : 'POST',
      body: JSON.stringify({ rating, review })
    });
    el('ratingStatus').textContent = isUpdate ? 'Rating updated.' : 'Rating added.';
    await loadRecipe(); // refresh avg
  } catch (err) {
    el('ratingStatus').textContent = err.message;
  }
}

async function toggleFavorite() {
  requireAuth();
  const id = getId();
  const btn = el('favBtn');
  btn.disabled = true;

  try {
    const isFav = btn.dataset.fav === 'true';
    if (isFav) {
      await fetchWithAuth(`/api/favorites/${id}`, { method: 'DELETE' });
      btn.dataset.fav = 'false';
      btn.innerHTML = `<svg class="h-6 w-6 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
      btn.classList.replace('text-red-500', 'text-brand-600');
      btn.classList.add('bg-white');
      btn.classList.remove('bg-red-50');
    } else {
      await fetchWithAuth(`/api/favorites/${id}`, { method: 'POST' });
      btn.dataset.fav = 'true';
      btn.innerHTML = `<svg class="h-6 w-6 text-red-500 fill-current transition-transform group-hover:scale-110" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>`;
      btn.classList.replace('text-brand-600', 'text-red-500');
      btn.classList.add('bg-red-50');
      btn.classList.remove('bg-white');
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function checkIfFavorite() {
  const user = getUser();
  if (!user) return;
  const id = getId();
  try {
    const favs = await fetchWithAuth('/api/favorites');
    const found = favs.some(r => r.id === id);
    const btn = el('favBtn');
    btn.dataset.fav = found ? 'true' : 'false';
    if(found) {
        btn.innerHTML = `<svg class="h-6 w-6 text-red-500 fill-current transition-transform group-hover:scale-110" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>`;
        btn.classList.add('text-red-500', 'bg-red-50');
        btn.classList.remove('text-brand-600', 'bg-white');
    } else {
        btn.innerHTML = `<svg class="h-6 w-6 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
    }
  } catch (e) {}
}

function renderStars(value) {
  let out = '';
  for (let i = 1; i <= 5; i += 1) {
    const cls = i <= value ? 'text-amber-400' : 'text-slate-300';
    out += `<svg class="h-4 w-4 ${cls}" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>`;
  }
  return out;
}

async function loadRatingsList(recipeId) {
  const list = el('reviewsList');
  const empty = el('reviewsEmpty');
  list.innerHTML = '';
  empty.classList.add('hidden');
  try {
    const rows = await fetchWithAuth(`/api/ratings/recipe/${recipeId}`);
    if (!rows.length) {
      empty.classList.remove('hidden');
      return;
    }
    list.innerHTML = rows.map(r => `
      <div class="bg-slate-50 border border-slate-100 rounded-xl p-4">
        <div class="flex items-center justify-between gap-2">
          <div class="font-semibold text-slate-800">${r.user_name || 'User'}</div>
          <div class="flex items-center gap-1">${renderStars(r.rating)}</div>
        </div>
        ${r.review ? `<div class="text-sm text-slate-600 mt-2">${r.review}</div>` : `<div class="text-sm text-slate-400 mt-2">No review text.</div>`}
      </div>
    `).join('');
  } catch (err) {
    empty.textContent = err.message;
    empty.classList.remove('hidden');
  }
}

function recoCard(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id, width: 160, height: 160 });
  return `
  <a href="recipe.html?id=${r.id}" class="block group rounded-xl overflow-hidden border border-slate-100 hover:shadow-lg transition-all bg-white flex gap-3 p-2">
    <div class="h-20 w-20 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden">
        ${imageSources.length 
            ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.id}" data-w="160" data-h="160" data-fallback="recipe" class="w-full h-full object-cover group-hover:scale-110 transition-transform" />`
            : `<div class="flex items-center justify-center h-full text-slate-300">ðŸ²</div>`
        }
    </div>
    <div class="flex-1 py-1">
        <h4 class="font-bold text-slate-800 line-clamp-1 group-hover:text-brand-600 transition-colors">${r.title}</h4>
        <div class="text-xs text-slate-500 mt-1">${r.difficulty || 'Medium'} â€¢ ${r.cook_time} min</div>
        <div class="mt-2 flex items-center gap-1">
            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Score ${Math.round(r.score)}</span>
        </div>
    </div>
  </a>`;
}

async function loadRecommendations(recipeId) {
  const box = el('similar');
  box.innerHTML = 'Loading...';
  try {
    const recs = await fetchWithAuth(`/api/recommendations/${recipeId}`);
    box.innerHTML = recs.length ? recs.map(recoCard).join('') : '<div class="text-slate-500">No similar recipes found.</div>';
    attachImageFallbacks(box);
  } catch (err) {
    box.innerHTML = `<div class="text-red-600">${err.message}</div>`;
  }
}

export async function initRecipe() {
  renderNavbar();
  updateGuestHints();
  bindStarPicker();
  el('favBtn').addEventListener('click', toggleFavorite);
  el('addRatingBtn').addEventListener('click', () => submitRating(false));
  el('updateRatingBtn').addEventListener('click', () => submitRating(true));
  await loadRecipe();
  await checkIfFavorite();
}
