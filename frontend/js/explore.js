import { fetchWithAuth } from "./api.js";
import { renderNavbar } from "./auth.js";
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from "./image-utils.js";

let state = {
  q: "",
  cuisine: "",
  difficulty: "",
  veg_type: "",
  maxTime: "",
  category: "",
  page: 1,
  limit: 10,
};

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && String(v).trim() !== "") p.set(k, v);
  });
  return p.toString();
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

async function loadCategories() {
  const catSelect = document.getElementById("category");
  if (!catSelect) return;
  const cats = await fetchWithAuth("/api/categories");
  catSelect.innerHTML =
    `<option value="">All</option>` +
    cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

async function loadRecipes() {
  const grid = document.getElementById("recipesGrid");
  const status = document.getElementById("status");
  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");
  const nextBottom = document.getElementById("nextBtnBottom");
  const prevBottom = document.getElementById("prevBtnBottom");
  const pageInfo = document.getElementById("pageInfo");

  status.textContent = "Loading...";
  grid.innerHTML = "";

  try {
    const data = await fetchWithAuth("/api/recipes?" + qs(state));
    const pagination = data && data.pagination ? data.pagination : null;
    const allRecipes = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.recipes)
          ? data.recipes
          : [];

    let recipes = allRecipes;
    let page = state.page;
    let total = allRecipes.length;
    let totalPages = Math.max(1, Math.ceil(total / state.limit));

    if (pagination) {
      recipes = allRecipes;
      page = pagination.page;
      total = pagination.total;
      totalPages = pagination.totalPages;
    } else {
      const start = (state.page - 1) * state.limit;
      recipes = allRecipes.slice(start, start + state.limit);
    }

    if (!recipes.length) {
      status.textContent = "No results found.";
    } else {
      status.textContent = "";
    }
    grid.innerHTML = recipes.map(recipeCard).join("");
    attachImageFallbacks(grid);

    pageInfo.textContent = `Page ${page} / ${totalPages} (Total: ${total})`;
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
    if (nextBottom) nextBottom.disabled = page >= totalPages;
    if (prevBottom) prevBottom.disabled = page <= 1;
  } catch (err) {
    status.textContent = err.message;
  }
}

function scrollGridToTop() {
  const header = document.getElementById("exploreHeader");
  if (header) {
    header.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const grid = document.getElementById("recipesGrid");
  if (grid) {
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindUI() {
  const form = document.getElementById("filtersForm");
  const search = document.getElementById("searchInput");

  form.addEventListener("change", () => {
    state.category = form.category.value;
    state.cuisine = form.cuisine.value;
    state.difficulty = form.difficulty.value;
    state.veg_type = form.veg_type.value;
    state.maxTime = form.maxTime.value;
    state.page = 1;
    loadRecipes();
  });

  // Handle Search Input Enter
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.q = search.value.trim();
      state.page = 1;
      loadRecipes();
    }
  });

  // Also update search state on change/blur if desired, but button is usually explicit
  document.getElementById("searchBtn").addEventListener("click", () => {
    state.q = search.value.trim();
    // Also grab other values just in case
    state.category = form.category.value;
    state.cuisine = form.cuisine.value;
    state.difficulty = form.difficulty.value;
    state.veg_type = form.veg_type.value;
    state.maxTime = form.maxTime.value;
    state.page = 1;
    loadRecipes();
  });

  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      loadRecipes();
      scrollGridToTop();
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      state.page += 1;
      loadRecipes();
      scrollGridToTop();
    });
  }

  const nextBottom = document.getElementById("nextBtnBottom");
  if (nextBottom) {
    nextBottom.addEventListener("click", () => {
      state.page += 1;
      loadRecipes();
      scrollGridToTop();
    });
  }

  const prevBottom = document.getElementById("prevBtnBottom");
  if (prevBottom) {
    prevBottom.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      loadRecipes();
      scrollGridToTop();
    });
  }

  document.getElementById("resetBtn").addEventListener("click", () => {
    search.value = "";
    form.reset();
    state = {
      ...state,
      q: "",
      cuisine: "",
      difficulty: "",
      veg_type: "",
      maxTime: "",
      category: "",
      page: 1,
    };
    loadRecipes();
  });
}

// Initialize with query params if redirected from home
function initFromQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('q')) {
        state.q = urlParams.get('q');
        document.getElementById('searchInput').value = state.q;
    }
}

export async function initExplore() {
  renderNavbar();
  await loadCategories();
  initFromQuery(); // Grab ?q=...
  bindUI();
  await loadRecipes();
}
