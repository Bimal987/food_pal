import { fetchWithAuth } from "./api.js";
import { renderNavbar } from "./auth.js";
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from "./image-utils.js";

let state = {
  q: "",
  cuisine: "",
  difficulty: "",
  type: "",
  maxTime: "",
  category: "",
  page: 1,
  limit: 9,
};

let allRecipes = [];
let filteredRecipes = [];

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && String(v).trim() !== "") p.set(k, v);
  });
  return p.toString();
}

function uniqueRecipesById(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    const id = String(recipe?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function normalizeDifficulty(value) {
  const v = normalizeText(value);
  if (v === "med" || v === "medium") return "medium";
  if (v === "easy") return "easy";
  if (v === "hard") return "hard";
  return "";
}

function normalizeRecipeType(value) {
  const v = normalizeText(value);
  if (v === "non-veg") return "nonveg";
  return v;
}

function formatRecipeType(value) {
  const type = normalizeRecipeType(value);
  const map = {
    veg: { label: "Vegetarian", className: "bg-green-500 border-green-500" },
    nonveg: { label: "Non-Veg", className: "bg-red-500 border-red-500" },
    vegan: { label: "Vegan", className: "bg-emerald-600 border-emerald-600" }
  };
  return map[type] || { label: "Recipe", className: "bg-slate-500 border-slate-500" };
}

function recipeCard(r) {
  const typeMeta = formatRecipeType(r.type || r.veg_type);
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.id });
  const rating = r.avg_rating
    ? `<div class="flex items-center gap-1 text-amber-500 font-medium text-xs bg-amber-50 px-2 py-1 rounded-full">
         <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
         ${r.avg_rating} <span class="text-amber-600/80">(${r.ratings_count || 0})</span>
       </div>`
    : `<span class="text-xs text-slate-400 font-medium">Not rated</span>`;

  return `
  <a href="recipe.html?id=${r.id}" class="recipe-card group block rounded-2xl overflow-hidden bg-white border border-slate-200/70 hover:-translate-y-1 transition-all duration-300">
    <div class="recipe-media aspect-[4/3] relative overflow-hidden">
      ${
        imageSources.length
          ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.id}" data-fallback="recipe" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="${r.title}" />`
          : `<div class="flex items-center justify-center h-full text-brand-200"><svg class="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`
      }
      <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </div>
    <div class="p-5">
      <div class="flex items-start justify-between gap-3 mb-2">
        <h3 class="font-bold text-lg text-slate-800 line-clamp-2 min-h-[3.25rem] group-hover:text-brand-600 transition-colors font-display">${r.title}</h3>
        ${rating}
      </div>
      <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-500 mb-4">
        <span class="recipe-meta-chip flex items-center gap-1 px-2 py-1 rounded-md">
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ${r.cook_time} min
        </span>
        <span class="recipe-meta-chip flex items-center gap-1 px-2 py-1 rounded-md">
           ${r.difficulty || "Medium"}
        </span>
        <span class="px-2 py-1 rounded-md border text-white ${typeMeta.className}">
          ${typeMeta.label}
        </span>
      </div>

      <div class="flex items-center justify-between pt-3 border-t border-slate-100">
        <div class="text-xs text-slate-400 font-medium uppercase tracking-wide">${r.category_name || "Recipe"}</div>
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
  const categoryGroup = document.getElementById("categoryFilterGroup");
  const meaningfulCats = cats.filter((c) => normalizeText(c.name) !== "general");
  if (!meaningfulCats.length) {
    if (categoryGroup) categoryGroup.classList.add("hidden");
    catSelect.innerHTML = `<option value="">All</option>`;
    return;
  }

  if (categoryGroup) categoryGroup.classList.remove("hidden");
  catSelect.innerHTML =
    `<option value="">All</option>` +
    meaningfulCats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

function populateSelect(select, values, { allLabel, formatter = (value) => value, selected = "" } = {}) {
  if (!select) return;
  const normalizedSelected = String(selected || "");
  select.innerHTML =
    `<option value="">${allLabel}</option>` +
    values.map((value) => {
      const isSelected = String(value) === normalizedSelected ? " selected" : "";
      return `<option value="${value}"${isSelected}>${formatter(value)}</option>`;
    }).join("");
}

function populateDynamicFilters() {
  const cuisineSelect = document.getElementById("cuisine");
  const typeSelect = document.getElementById("type");

  const cuisines = Array.from(new Set(
    allRecipes
      .map((recipe) => String(recipe.cuisine || "").trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const types = Array.from(new Set(
    allRecipes
      .map((recipe) => normalizeRecipeType(recipe.type || recipe.veg_type))
      .filter(Boolean)
  ));

  const typeOrder = ["veg", "nonveg", "vegan"];
  types.sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

  populateSelect(cuisineSelect, cuisines, {
    allLabel: "All Cuisines",
    selected: state.cuisine
  });

  populateSelect(typeSelect, types, {
    allLabel: "Any",
    selected: state.type,
    formatter: (value) => formatRecipeType(value).label
  });
}

function loadRecipes() {
  const grid = document.getElementById("recipesGrid");
  const status = document.getElementById("status");
  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");
  const nextBottom = document.getElementById("nextBtnBottom");
  const prevBottom = document.getElementById("prevBtnBottom");
  const pageInfo = document.getElementById("pageInfo");

  if (!allRecipes.length) {
    status.textContent = "Loading...";
    grid.innerHTML = "";
    return;
  }

  const total = filteredRecipes.length;
  const totalPages = Math.max(1, Math.ceil(total / state.limit));
  const page = Math.min(state.page, totalPages);
  const start = (page - 1) * state.limit;
  const recipes = filteredRecipes.slice(start, start + state.limit);

  if (!recipes.length) {
      status.textContent = "No results found.";
      grid.innerHTML = `
        <div class="empty-state sm:col-span-2 xl:col-span-3">
          <div class="font-display text-lg font-bold text-slate-800 mb-1">No recipes match these filters.</div>
          <p class="text-sm">Try a different keyword, cuisine, difficulty, or cooking time.</p>
        </div>`;
  } else {
    status.textContent = "";
    grid.innerHTML = recipes.map(recipeCard).join("");
  }
  attachImageFallbacks(grid);

  pageInfo.textContent = `Page ${page} / ${totalPages} (Total: ${total})`;
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= totalPages;
  if (nextBottom) nextBottom.disabled = page >= totalPages;
  if (prevBottom) prevBottom.disabled = page <= 1;
}

async function ensureAllRecipes() {
  const status = document.getElementById("status");
  const grid = document.getElementById("recipesGrid");
  status.textContent = "Loading...";
  grid.innerHTML = "";

  try {
    const first = await fetchWithAuth("/api/recipes?" + qs({ page: 1, limit: 1000 }));
    const pagination = first && first.pagination ? first.pagination : null;
    const firstPage = Array.isArray(first)
      ? first
      : Array.isArray(first?.data)
        ? first.data
        : Array.isArray(first?.recipes)
          ? first.recipes
          : [];

    allRecipes = uniqueRecipesById(firstPage);

    if (pagination && pagination.totalPages > 1) {
      const pages = [];
      for (let p = 2; p <= pagination.totalPages; p += 1) {
        pages.push(fetchWithAuth("/api/recipes?" + qs({ page: p, limit: pagination.limit || 1000 })));
      }
      const results = await Promise.all(pages);
      results.forEach((res) => {
        const rows = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.recipes)
              ? res.recipes
              : [];
        allRecipes = uniqueRecipesById(allRecipes.concat(rows));
      });
    }
  } catch (err) {
    status.textContent = err.message;
  }
}

function applyFilters() {
  const form = document.getElementById("filtersForm");
  const search = document.getElementById("searchInput");
  if (!form) return;

  const searchText = normalizeText(search?.value || "");
  const selectedCategory = normalizeText(form.category.value);
  const selectedCuisine = normalizeText(form.cuisine.value);
  const selectedDifficultyRaw = normalizeText(form.difficulty.value);
  const selectedDifficulty = selectedDifficultyRaw === "any" ? "" : normalizeDifficulty(selectedDifficultyRaw);
  const selectedType = normalizeRecipeType(form.type.value);
  const selectedMaxTime = parseInt(form.maxTime.value || "", 10);

  state.q = searchText;
  state.category = form.category.value;
  state.cuisine = form.cuisine.value;
  state.difficulty = form.difficulty.value;
  state.type = form.type.value;
  state.maxTime = form.maxTime.value;
  state.page = 1;

  filteredRecipes = allRecipes.filter((r) => {
    const title = normalizeText(r.title || r.name);
    const cuisine = normalizeText(r.cuisine);
    const categoryName = normalizeText(r.category_name || r.category?.name);
    const categoryId = String(r.category_id || r.category?.id || "").toLowerCase();
    const difficulty = normalizeDifficulty(r.difficulty);
    const description = normalizeText(r.description || r.summary);
    const ingredientsText = Array.isArray(r.ingredients)
      ? normalizeText(r.ingredients.map((i) => i.name || i).join(" "))
      : normalizeText(r.ingredients);

    if (searchText) {
      const haystack = `${title} ${ingredientsText} ${categoryName} ${cuisine} ${description}`.trim();
      if (!haystack.includes(searchText)) return false;
    }

    if (selectedCategory) {
      if (selectedCategory !== categoryId && selectedCategory !== categoryName) return false;
    }

    if (selectedCuisine) {
      if (cuisine !== selectedCuisine) return false;
    }

    if (selectedDifficulty) {
      if (difficulty !== selectedDifficulty) return false;
    }

    if (selectedType) {
      const recipeType = normalizeRecipeType(r.type || r.veg_type);
      if (recipeType !== selectedType) return false;
    }

    if (Number.isFinite(selectedMaxTime) && selectedMaxTime > 0) {
      const cookTime = parseInt(r.cook_time, 10);
      if (!Number.isFinite(cookTime) || cookTime > selectedMaxTime) return false;
    }

    return true;
  });

  loadRecipes();
}

function scrollGridToTop() {
  const target = document.getElementById("exploreHeader") || document.getElementById("recipesGrid");
  const top = target
    ? target.getBoundingClientRect().top + window.scrollY - 88
    : 0;

  requestAnimationFrame(() => {
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  });
}

function goToPage(page) {
  state.page = page;
  loadRecipes();
  scrollGridToTop();
}

function bindUI() {
  const form = document.getElementById("filtersForm");
  const search = document.getElementById("searchInput");

  form.addEventListener("change", () => {
    applyFilters();
  });

  search.addEventListener("input", () => {
    applyFilters();
  });

  const searchBtn = document.getElementById("searchBtn");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      applyFilters();
    });
  }

  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      goToPage(Math.max(1, state.page - 1));
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      goToPage(state.page + 1);
    });
  }

  const nextBottom = document.getElementById("nextBtnBottom");
  if (nextBottom) {
    nextBottom.addEventListener("click", () => {
      goToPage(state.page + 1);
    });
  }

  const prevBottom = document.getElementById("prevBtnBottom");
  if (prevBottom) {
    prevBottom.addEventListener("click", () => {
      goToPage(Math.max(1, state.page - 1));
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
      type: "",
      maxTime: "",
      category: "",
      page: 1,
    };
    applyFilters();
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
  await ensureAllRecipes();
  populateDynamicFilters();
  applyFilters();
}
