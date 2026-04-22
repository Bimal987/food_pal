import { fetchWithAuth } from './api.js';
import { renderNavbar, requireUser } from './auth.js';
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from './image-utils.js';

export function favoriteCard(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id });
  const tried = Boolean(r.tried);
  const triedClass = tried
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100';
  const triedIcon = tried
    ? `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>`
    : `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="8" stroke-width="2" /></svg>`;
  const rating = r.avg_rating 
    ? `<div class="flex items-center gap-1 text-amber-500 font-medium text-xs bg-amber-50 px-2 py-1 rounded-full"><span class="text-xs">⭐</span> ${r.avg_rating} <span class="text-amber-600/80">(${r.ratings_count || 0})</span></div>` 
    : `<span class="text-xs text-slate-400 font-medium">Not rated</span>`;

  return `
  <div class="recipe-card group rounded-2xl overflow-hidden bg-white border border-slate-200/70 hover:-translate-y-1 transition-all duration-300 relative">
    <div class="recipe-media aspect-[4/3] relative overflow-hidden">
      ${imageSources.length 
        ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.id}" data-fallback="recipe" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />` 
        : `<div class="flex items-center justify-center h-full text-brand-200"><svg class="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`}
      <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <button data-id="${r.id}" class="removeBtn absolute top-3 right-3 bg-white/90 backdrop-blur text-red-500 hover:text-red-600 p-2 rounded-full shadow-md hover:bg-white transition-all transform hover:scale-105 z-10" title="Remove from favorites">
         <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
      </button>
    </div>
    
    <div class="p-5">
      <div class="flex items-start justify-between gap-3 mb-2">
        <a href="recipe.html?id=${r.id}" class="font-bold text-lg text-slate-800 line-clamp-2 min-h-[3.25rem] group-hover:text-brand-600 transition-colors font-display">${r.title}</a>
        ${rating}
      </div>
      
      <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-500 mb-4">
        <span class="recipe-meta-chip flex items-center gap-1 px-2 py-1 rounded-md">
           ${r.difficulty || 'Medium'}
        </span>
        <span class="recipe-meta-chip flex items-center gap-1 px-2 py-1 rounded-md">
           ${r.cook_time} min
        </span>
      </div>

      <div class="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
        <button type="button" data-id="${r.id}" data-tried="${tried ? 'true' : 'false'}" class="triedBtn inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border font-semibold text-sm transition-colors ${triedClass}" aria-pressed="${tried ? 'true' : 'false'}" title="${tried ? 'Mark as not tried' : 'Mark as tried'}">
          ${triedIcon}
          <span>${tried ? 'Tried' : 'Not tried'}</span>
        </button>
        <a href="recipe.html?id=${r.id}" class="block w-full text-center py-2 rounded-lg bg-slate-50 text-slate-600 font-semibold text-sm hover:bg-brand-50 hover:text-brand-600 transition-colors">
          View Recipe
        </a>
      </div>
    </div>
  </div>`;
}

export async function loadFavorites(options = {}) {
  const {
    gridId = 'grid',
    statusId = 'status',
    emptyClass = 'sm:col-span-2 lg:col-span-3 xl:col-span-4',
    onChange = null
  } = options;
  const grid = document.getElementById(gridId);
  const status = document.getElementById(statusId);
  if (!grid || !status) return [];

  status.textContent = 'Loading...';
  grid.innerHTML = '';

  try {
    const favs = await fetchWithAuth('/api/favorites');
    if (!favs.length) {
      status.textContent = '';
      grid.innerHTML = `
        <div class="empty-state ${emptyClass}">
          <p class="text-sm">Start saving recipes you like to build your personal collection.</p>
          <a href="explore.html" class="inline-flex mt-4 px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">Explore Recipes</a>
        </div>`;
      if (onChange) onChange(favs);
      return favs;
    }
    status.textContent = '';
    grid.innerHTML = favs.map(favoriteCard).join('');
    attachImageFallbacks(grid);
    grid.querySelectorAll('.removeBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await fetchWithAuth(`/api/favorites/${btn.dataset.id}`, { method: 'DELETE' });
          await loadFavorites(options);
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
    grid.querySelectorAll('.triedBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tried = btn.dataset.tried !== 'true';
        btn.disabled = true;
        try {
          await fetchWithAuth(`/api/favorites/${btn.dataset.id}/tried`, {
            method: 'PATCH',
            body: JSON.stringify({ tried })
          });
          await loadFavorites(options);
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
    if (onChange) onChange(favs);
    return favs;
  } catch (err) {
    status.textContent = err.message;
    return [];
  }
}

export async function initFavorites() {
  requireUser();
  renderNavbar();
  await loadFavorites();
}
