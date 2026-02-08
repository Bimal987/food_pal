import { fetchWithAuth } from './api.js';
import { renderNavbar, requireUser } from './auth.js';
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from './image-utils.js';

function card(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id });
  const rating = r.avg_rating 
    ? `<div class="flex items-center gap-1 text-amber-500 font-medium text-xs bg-amber-50 px-2 py-1 rounded-full"><span class="text-xs">⭐</span> ${r.avg_rating} <span class="text-amber-600/80">(${r.ratings_count || 0})</span></div>` 
    : `<span class="text-xs text-slate-400 font-medium">Not rated</span>`;

  return `
  <div class="group rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative">
    <div class="aspect-[4/3] bg-brand-50 relative overflow-hidden">
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
        <a href="recipe.html?id=${r.id}" class="font-bold text-lg text-slate-800 line-clamp-1 group-hover:text-brand-600 transition-colors font-display">${r.title}</a>
        ${rating}
      </div>
      
      <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-500 mb-4">
        <span class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
           ${r.difficulty || 'Medium'}
        </span>
        <span class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
           ${r.cook_time} min
        </span>
      </div>

      <div class="pt-3 border-t border-slate-100">
        <a href="recipe.html?id=${r.id}" class="block w-full text-center py-2 rounded-lg bg-slate-50 text-slate-600 font-semibold text-sm hover:bg-brand-50 hover:text-brand-600 transition-colors">
          View Recipe
        </a>
      </div>
    </div>
  </div>`;
}

async function loadFavorites() {
  const grid = document.getElementById('grid');
  const status = document.getElementById('status');
  status.textContent = 'Loading...';
  grid.innerHTML = '';

  try {
    const favs = await fetchWithAuth('/api/favorites');
    if (!favs.length) {
      status.textContent = 'No favorites yet.';
      return;
    }
    status.textContent = '';
    grid.innerHTML = favs.map(card).join('');
    attachImageFallbacks(grid);
    document.querySelectorAll('.removeBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await fetchWithAuth(`/api/favorites/${btn.dataset.id}`, { method: 'DELETE' });
          await loadFavorites();
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    status.textContent = err.message;
  }
}

export async function initFavorites() {
  requireUser();
  renderNavbar();
  await loadFavorites();
}
