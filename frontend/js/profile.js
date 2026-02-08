import { fetchWithAuth, getUser } from './api.js';
import { renderNavbar, requireUser } from './auth.js';
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from './image-utils.js';

async function loadProfile() {
  const user = getUser();
  if (!user) return; // Should be handled by requireAuth

  // Fetch fresh profile data
  try {
    const profile = await fetchWithAuth('/api/auth/me');
    document.getElementById('userName').textContent = profile.name;
    document.getElementById('userEmail').textContent = profile.email;
    document.getElementById('initials').textContent = profile.name.charAt(0).toUpperCase();
  } catch (err) {
    console.error('Failed to load profile', err);
  }

  // Fetch favorites count
  try {
     const favs = await fetchWithAuth('/api/favorites');
     document.getElementById('favCount').textContent = favs.length;
  } catch (e) {}

  // Fetch ratings
  const list = document.getElementById('ratingsList');
  list.innerHTML = `<div class="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-100">Loading reviews...</div>`;
  
  try {
    const ratings = await fetchWithAuth('/api/ratings/me');
    document.getElementById('ratingsCount').textContent = ratings.length;
    
    if (!ratings.length) {
      list.innerHTML = `<div class="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-100">You haven't reviewed any recipes yet.</div>`;
      return;
    }

    list.innerHTML = ratings.map(r => {
      const imageUrl = normalizeImageUrl(r.image_url);
      const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.recipe_id, width: 160, height: 160 });
      return `
        <div class="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex gap-4 hover:shadow-md transition-shadow">
          <div class="h-16 w-16 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden">
             ${imageSources.length ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.recipe_id}" data-w="160" data-h="160" data-fallback="recipe" class="w-full h-full object-cover">` : `<div class="flex items-center justify-center h-full text-slate-300 text-xs">No image</div>`}
          </div>
          <div class="flex-1">
             <div class="flex justify-between items-start">
                <a href="recipe.html?id=${r.recipe_id}" class="font-bold text-lg text-slate-800 hover:text-brand-600 transition-colors font-display">${r.title}</a>
                <span class="text-xs text-slate-400">${new Date(r.created_at).toLocaleDateString()}</span>
             </div>
             
             <div class="flex items-center gap-1 my-1">
              ${Array(5).fill(0).map((_, i) => `<span class="text-sm ${i < r.rating ? 'text-amber-500' : 'text-slate-200'}">&#9733;</span>`).join('')}
               <span class="text-sm font-bold text-slate-700 ml-1">${r.rating}/5</span>
             </div>
             
             ${r.review ? `<p class="text-slate-600 text-sm mt-2 italic">"${r.review}"</p>` : ''}
          </div>
        </div>
      `;
    }).join('');
    attachImageFallbacks(list);

  } catch (err) {
     list.innerHTML = `<div class="text-red-500 p-4 bg-white rounded-xl border border-red-100">${err.message}</div>`;
  }
}

export async function initProfile() {
  requireUser();
  renderNavbar();
  await loadProfile();
}
