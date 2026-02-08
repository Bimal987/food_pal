import { fetchWithAuth } from "./api.js";
import { renderNavbar } from "./auth.js";
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from "./image-utils.js";

// Reusable card for grid
function recipeCard(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id });
  const rating = r.avg_rating
    ? `<div class="flex items-center gap-1 text-amber-500 font-medium text-xs bg-amber-50 px-2 py-1 rounded-full">
         <span class="text-xs">⭐</span> ${r.avg_rating} <span class="text-amber-600/80">(${r.ratings_count || 0})</span>
       </div>`
    : `<span class="text-xs text-slate-400 font-medium">Not rated</span>`;

  return `
  <a href="recipe.html?id=${r.id}" class="group block rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
    <div class="aspect-[4/3] bg-brand-50 relative overflow-hidden">
      ${
        imageSources.length
          ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.id}" data-fallback="recipe" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="${r.title}" />`
          : `<div class="flex items-center justify-center h-full text-brand-200"><svg class="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`
      }
      <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </div>
    <div class="p-5">
      <div class="flex items-start justify-between gap-3 mb-2">
        <h3 class="font-bold text-lg text-slate-800 line-clamp-1 group-hover:text-brand-600 transition-colors font-display">${r.title}</h3>
        ${rating}
      </div>
      <div class="flex gap-2 text-xs font-medium text-slate-500">
        <span class="bg-slate-50 px-2 py-1 rounded border border-slate-100">${r.cook_time} min</span>
        <span class="bg-slate-50 px-2 py-1 rounded border border-slate-100">${r.difficulty || 'Med'}</span>
      </div>
    </div>
  </a>`;
}

// Featured Hero Card
function featuredCard(r) {
    const imageUrl = normalizeImageUrl(r.image_url);
    const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id, width: 1200, height: 800 });
    return `
    <div class="relative rounded-3xl overflow-hidden shadow-2xl group h-[500px]">
        ${imageSources.length 
            ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.id}" data-w="1200" data-h="800" data-fallback="recipe" class="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />`
            : `<div class="absolute inset-0 bg-brand-100 flex items-center justify-center text-brand-300"><svg class="w-32 h-32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`
        }
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
        
        <div class="absolute bottom-0 left-0 p-8 md:p-12 w-full md:w-2/3 text-white">
            <span class="bg-brand-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 inline-block">Recipe of the Day</span>
            <h3 class="text-4xl md:text-5xl font-display font-extrabold mb-4 leading-tight group-hover:text-brand-300 transition-colors">${r.title}</h3>
            
            <div class="flex flex-wrap gap-4 text-sm font-medium text-slate-200 mb-8">
                <span class="flex items-center gap-2 bg-white/20 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    ${r.cook_time} min
                </span>
                <span class="flex items-center gap-2 bg-white/20 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10">
                    ${r.difficulty || 'Medium'}
                </span>
                <span class="flex items-center gap-2 bg-white/20 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10">
                    ${r.cuisine || 'Global'}
                </span>
            </div>

            <a href="recipe.html?id=${r.id}" class="inline-flex items-center gap-2 bg-white text-slate-900 px-8 py-3 rounded-full font-bold hover:bg-brand-50 transition-colors transform hover:-translate-y-1">
                View Recipe 
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>
        </div>
    </div>
    `;
}

async function loadFeatured() {
    const el = document.getElementById('featured');
    try {
        const data = await fetchWithAuth('/api/recipes?limit=1&sort=random');
        if(data.data && data.data.length) {
            el.innerHTML = featuredCard(data.data[0]);
            attachImageFallbacks(el);
        } else {
            el.innerHTML = `<div class="p-8 text-center text-slate-500">No featured recipes today.</div>`;
        }
    } catch(e) {
        console.error(e);
        el.innerHTML = `<div class="p-4 text-red-500">Failed to load content.</div>`;
    }
}

async function loadPopular() {
    const el = document.getElementById('popularGrid');
    try {
        const data = await fetchWithAuth('/api/recipes?limit=4&sort=popular');
        el.innerHTML = (data.data || []).map(recipeCard).join('');
        attachImageFallbacks(el);
    } catch(e) { console.error(e); }
}

async function loadLatest() {
    const el = document.getElementById('latestGrid');
    try {
        const data = await fetchWithAuth('/api/recipes?limit=6&sort=newest'); // default is newest actually?
        el.innerHTML = (data.data || []).map(recipeCard).join('');
        attachImageFallbacks(el);
    } catch(e) { console.error(e); }
}

function bindSearch() {
    const form = document.getElementById('searchForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = document.getElementById('searchInput').value.trim();
        if(q) window.location.href = `explore.html?q=${encodeURIComponent(q)}`;
    });
}

export async function initHome() {
  renderNavbar();
  bindSearch();
  
  // Parallel fetch for speed
  await Promise.all([
      loadFeatured(),
      loadPopular(),
      loadLatest()
  ]);
}
