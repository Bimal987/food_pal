import { fetchWithAuth } from "./api.js";
import { renderNavbar } from "./auth.js";
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from "./image-utils.js";

let allIngredients = [];
let filteredIngredients = [];
let selectedIds = new Set();
let selectedNames = new Map();

let state = {
  mode: "all",
  page: 1,
  limit: 9,
};

function el(id) {
  return document.getElementById(id);
}

function recipeCard(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id });
  const rating = r.avg_rating
    ? `<div class="flex items-center gap-1 text-amber-500 font-medium text-xs bg-amber-50 px-2 py-1 rounded-full">
         <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
         ${r.avg_rating} <span class="text-amber-600/80">(${r.ratings_count || 0})</span>
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
      <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-500 mb-4">
        <span class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ${r.cook_time} min
        </span>
        <span class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
           ${r.difficulty || "Medium"}
        </span>
        <span class="px-2 py-1 rounded-md border text-white ${r.veg_type === "non-veg" ? "bg-red-500 border-red-500" : "bg-green-500 border-green-500"}">
          ${r.veg_type === "non-veg" ? "Non-Veg" : "Veg"}
        </span>
      </div>
      <div class="flex items-center justify-between pt-3 border-t border-slate-100">
        <div class="text-xs text-slate-400 font-medium uppercase tracking-wide">${r.category_name || "General"}</div>
        <div class="text-brand-600 text-sm font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all">
          View Recipe 
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
        </div>
      </div>
    </div>
  </a>`;
}

function recoCard(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id });
  const required = r.required_ingredients || [];
  const requiredBadges = required.map(m => `<span class="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-full">${m}</span>`).join("");

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
        <span class="text-xs text-slate-400 font-medium">Missing ${r.missing_count}</span>
      </div>
      <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-500 mb-4">
        <span class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ${r.cook_time} min
        </span>
        <span class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
           ${r.difficulty || "Medium"}
        </span>
        <span class="px-2 py-1 rounded-md border text-white ${r.veg_type === "non-veg" ? "bg-red-500 border-red-500" : "bg-green-500 border-green-500"}">
          ${r.veg_type === "non-veg" ? "Non-Veg" : "Veg"}
        </span>
      </div>
      <div class="text-xs font-semibold text-slate-500 mb-2">Required ingredients</div>
      <div class="flex flex-wrap gap-2">${requiredBadges}</div>
    </div>
  </a>`;
}

async function loadIngredients() {
  const rows = await fetchWithAuth("/api/ingredients");
  allIngredients = rows;
  filteredIngredients = rows;
  renderIngredientList();
}

function renderIngredientList() {
  const list = el("ingredientList");
  const empty = el("ingredientEmpty");
  list.innerHTML = filteredIngredients.map((ing) => {
    const checked = selectedIds.has(ing.id) ? "checked" : "";
    return `
      <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" data-id="${ing.id}" ${checked} />
        <span>${ing.name}</span>
      </label>
    `;
  }).join("");

  empty.classList.toggle("hidden", filteredIngredients.length > 0);

  list.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = parseInt(cb.dataset.id, 10);
      if (cb.checked) {
        selectedIds.add(id);
        const ing = allIngredients.find(i => i.id === id);
        if (ing) selectedNames.set(id, ing.name);
      } else {
        selectedIds.delete(id);
        selectedNames.delete(id);
      }
      state.page = 1;
      renderSelectedChips();
      loadRecipesAndRecs();
    });
  });
}

function renderSelectedChips() {
  const wrap = el("selectedWrap");
  const chips = el("selectedChips");
  if (selectedIds.size === 0) {
    wrap.classList.add("hidden");
    chips.innerHTML = "";
    return;
  }

  wrap.classList.remove("hidden");
  chips.innerHTML = Array.from(selectedIds).map(id => {
    const name = selectedNames.get(id) || "";
    return `
      <button class="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-full hover:bg-slate-200 transition-colors" data-id="${id}">
        ${name} x
      </button>
    `;
  }).join("");

  chips.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      selectedIds.delete(id);
      selectedNames.delete(id);
      const cb = document.querySelector(`input[type="checkbox"][data-id="${id}"]`);
      if (cb) cb.checked = false;
      state.page = 1;
      renderSelectedChips();
      loadRecipesAndRecs();
    });
  });
}

async function loadRecipesAndRecs() {
  const status = el("status");
  const grid = el("recipesGrid");
  const pageInfo = el("pageInfo");
  const prev = el("prevBtn");
  const next = el("nextBtn");

  if (selectedIds.size === 0) {
    status.textContent = "Select ingredients to see matches.";
    grid.innerHTML = "";
    pageInfo.textContent = "";
    prev.disabled = true;
    next.disabled = true;
    renderRecommendations([]);
    return;
  }

  status.textContent = "Loading...";
  grid.innerHTML = "";

  const ids = Array.from(selectedIds).join(",");
  try {
    const data = await fetchWithAuth(`/api/recipes/by-ingredients?ids=${ids}&mode=${state.mode}&page=${state.page}&limit=${state.limit}`);
    const recipes = data.data || [];
    grid.innerHTML = recipes.map(recipeCard).join("");
    attachImageFallbacks(grid);
    if (!recipes.length) status.textContent = "No matches found.";
    else status.textContent = "";

    const p = data.pagination;
    pageInfo.textContent = `Page ${p.page} / ${p.totalPages} (Total: ${p.total})`;
    prev.disabled = p.page <= 1;
    next.disabled = p.page >= p.totalPages;
  } catch (err) {
    status.textContent = err.message;
  }

  try {
    const reco = await fetchWithAuth(`/api/recipes/ingredients/recommendations?ids=${ids}&maxMissing=2`);
    renderRecommendations(reco.data || []);
  } catch (err) {
    renderRecommendations([]);
  }
}

function renderRecommendations(items) {
  const recoGrid = el("recoGrid");
  const empty = el("recoEmpty");
  if (!items.length) {
    recoGrid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  recoGrid.innerHTML = items.map(recoCard).join("");
  attachImageFallbacks(recoGrid);
}

function bindUI() {
  el("ingredientSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    filteredIngredients = allIngredients.filter(i => i.name.toLowerCase().includes(q));
    renderIngredientList();
  });

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      state.mode = radio.value;
      state.page = 1;
      loadRecipesAndRecs();
    });
  });

  el("clearBtn").addEventListener("click", () => {
    selectedIds = new Set();
    selectedNames = new Map();
    document.querySelectorAll('#ingredientList input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    renderSelectedChips();
    loadRecipesAndRecs();
  });

  el("prevBtn").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadRecipesAndRecs();
  });

  el("nextBtn").addEventListener("click", () => {
    state.page += 1;
    loadRecipesAndRecs();
  });
}

export async function initIngredients() {
  renderNavbar();
  bindUI();
  await loadIngredients();
  renderSelectedChips();
  await loadRecipesAndRecs();
}
