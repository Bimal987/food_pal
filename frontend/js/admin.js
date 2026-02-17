import { fetchWithAuth, getUser, clearAuth } from './api.js';
import { renderNavbar, requireAdmin } from './auth.js';

function el(id) { return document.getElementById(id); }

function getAuthToken() {
  return localStorage.getItem('token') || localStorage.getItem('authToken');
}

function showAuthRequiredModal(message) {
  let modal = document.getElementById('adminAuthModal');
  if (!modal) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div id="adminAuthModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" data-admin-auth-overlay></div>
        <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6" role="dialog" aria-modal="true" aria-labelledby="adminAuthTitle">
          <div class="flex items-start justify-between gap-4">
            <h3 id="adminAuthTitle" class="font-display font-bold text-lg text-slate-900">Login Required</h3>
            <button type="button" class="text-slate-400 hover:text-slate-600" aria-label="Close" data-admin-auth-close>
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
          </div>
          <p id="adminAuthMessage" class="mt-3 text-sm text-slate-600"></p>
          <div class="mt-6 flex items-center gap-3">
            <a href="login.html" class="flex-1 text-center bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors">Login</a>
            <button type="button" class="flex-1 text-center bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors" data-admin-auth-close>Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);
    modal = document.getElementById('adminAuthModal');
    const closeButtons = modal.querySelectorAll('[data-admin-auth-close]');
    const overlay = modal.querySelector('[data-admin-auth-overlay]');
    const closeModal = () => modal.classList.add('hidden');
    closeButtons.forEach(btn => btn.addEventListener('click', closeModal));
    overlay.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
  }
  const msg = document.getElementById('adminAuthMessage');
  if (msg) msg.textContent = message || 'Please login as admin to continue.';
  modal.classList.remove('hidden');
}

let categories = [];
let recipes = [];
let allAdminRecipes = [];
let visibleRecipes = [];
let editingId = null;

// --- Navigation & View Switching ---
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-item');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      navBtns.forEach(b => b.classList.remove('active', 'bg-slate-800', 'text-white'));
      navBtns.forEach(b => b.classList.add('hover:bg-slate-800', 'hover:text-white')); // helper to reset
      
      btn.classList.add('active', 'bg-slate-800', 'text-white');
      
      // Update Title
      const viewName = btn.dataset.view;
      el('pageTitle').textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);

      // Show Section
      document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
      el(`view-${viewName}`).classList.remove('hidden');
    });
  });
}

// --- Dashboard Stats ---
async function loadStats() {
  try {
    const stats = await fetchWithAuth('/api/admin/stats');
    el('stat-recipes').textContent = stats.recipes;
    el('stat-users').textContent = stats.users;
    el('stat-ratings').textContent = stats.ratings;
    el('stat-categories').textContent = stats.categories;
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

// --- Recipes Management ---
function optionCats(selectedId) {
  return categories.map(c => `<option value="${c.id}" ${String(selectedId)===String(c.id)?'selected':''}>${c.name}</option>`).join('');
}

function renderRecipeRows(list) {
  const tbody = el('recipesTbody');
  if (!list.length) {
    tbody.innerHTML = `
      <tr class="border-b">
        <td class="p-6 text-center text-slate-400" colspan="6">No recipes found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(r => `
    <tr class="border-b transition hover:bg-slate-50">
      <td class="p-4">${r.id}</td>
      <td class="p-4 font-medium text-slate-900">${r.title}</td>
      <td class="p-4 text-slate-600">${r.category_name || '—'}</td>
      <td class="p-4 text-slate-600">${r.cuisine || '—'}</td>
      <td class="p-4">
         <span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
           ${r.cook_time}m
         </span>
         <span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${r.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : (r.difficulty === 'Hard' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700')}">
           ${r.difficulty || '-'}
         </span>
      </td>
      <td class="p-4 flex gap-2">
        <button class="p-2 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 editBtn" data-id="${r.id}" title="Edit">
           <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
        <button class="p-2 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 delBtn" data-id="${r.id}" title="Delete">
           <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', () => openModal(parseInt(b.dataset.id, 10))));
  document.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', () => deleteRecipe(parseInt(b.dataset.id, 10))));
}

async function loadRecipes() {
  try {
    recipes = await fetchWithAuth('/api/admin/recipes');
    allAdminRecipes = Array.isArray(recipes) ? recipes.slice() : [];
    visibleRecipes = allAdminRecipes.slice();
    renderRecipeRows(visibleRecipes);
  } catch (e) { console.error(e); }
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function applyRecipeSearch() {
  const input = document.querySelector("input[placeholder=\"Search recipes...\"]");
  if (!input) return;
  const q = (input.value || '').trim().toLowerCase();
  if (!q) {
    visibleRecipes = allAdminRecipes.slice();
    renderRecipeRows(visibleRecipes);
    return;
  }

  visibleRecipes = allAdminRecipes.filter(r => {
    const title = String(r.title || '').toLowerCase();
    const category = String(r.category_name || '').toLowerCase();
    const cuisine = String(r.cuisine || '').toLowerCase();
    const id = String(r.id || '');
    return (
      title.includes(q) ||
      category.includes(q) ||
      cuisine.includes(q) ||
      id.includes(q)
    );
  });
  renderRecipeRows(visibleRecipes);
}

async function deleteRecipe(id) {
  if (!confirm('Are you sure you want to delete this recipe?')) return;
  try {
    await fetchWithAuth(`/api/admin/recipes/${id}`, { method: 'DELETE' });
    await loadRecipes();
    await loadStats(); // update count
  } catch (err) { alert(err.message); }
}

// --- Modal Logic ---
const modal = el('modalOverlay');
const modalContent = el('modalContent');

function openModal(id = null) {
  editingId = id;
  el('modalTitle').textContent = id ? `Edit Recipe #${id}` : 'Add Recipe';
  el('submitBtn').textContent = id ? 'Update Recipe' : 'Create Recipe';
  el('recipeForm').reset();
  
  // Populate categories in select
  el('recipeCategory').innerHTML = '<option value="">Select Category</option>' + optionCats('');

  if (id) {
    const r = recipes.find(x => x.id === id);
    if (r) {
        // We need full details for ingredients
        fetchWithAuth(`/api/recipes/${id}`).then(detail => {
            el('title').value = detail.title || '';
            el('description').value = detail.description || '';
            el('steps').value = detail.steps || '';
            el('cook_time').value = detail.cook_time || 0;
            el('difficulty').value = detail.difficulty || 'Medium';
            el('cuisine').value = detail.cuisine || '';
            el('veg_type').value = detail.veg_type || 'veg';
            el('image_url').value = detail.image_url || '';
            el('recipeCategory').value = detail.category_id || '';
            el('ingredients').value = (detail.ingredients || []).map(i => i.name).join(', ');
        });
    }
  }

  modal.classList.remove('hidden');
  // Small delay for transition
  setTimeout(() => {
      modalContent.classList.remove('scale-95', 'opacity-0');
      modalContent.classList.add('scale-100', 'opacity-100');
  }, 10);
}

function closeModal() {
  modalContent.classList.remove('scale-100', 'opacity-100');
  modalContent.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
      modal.classList.add('hidden');
  }, 300);
}

async function handleRecipeSubmit(e) {
  e.preventDefault();
  const token = getAuthToken();
  if (!token) {
    showAuthRequiredModal('Please login as admin to create a recipe.');
    return;
  }
  const payload = {
    title: el('title').value.trim(),
    description: el('description').value.trim(),
    steps: el('steps').value.trim(),
    cook_time: parseInt(el('cook_time').value || '0', 10),
    difficulty: el('difficulty').value.trim(),
    cuisine: el('cuisine').value.trim(),
    veg_type: el('veg_type').value,
    image_url: el('image_url').value.trim(),
    category_id: el('recipeCategory').value ? parseInt(el('recipeCategory').value, 10) : null,
    ingredients: el('ingredients').value.trim()
  };

  try {
    // Frontend validation
    if (!payload.title || payload.title.length < 3) {
      throw new Error('Title is required and must be at least 3 characters long');
    }
    
    if (!payload.description || payload.description.length < 10) {
      throw new Error('Description is required and must be at least 10 characters long');
    }
    
    if (!payload.steps || payload.steps.length < 10) {
      throw new Error('Steps are required and must be at least 10 characters long');
    }
    
    if (!payload.cook_time || payload.cook_time <= 0) {
      throw new Error('Cook time is required and must be a positive number');
    }
    
    if (!payload.ingredients || payload.ingredients.length === 0) {
      throw new Error('At least one ingredient is required');
    }
    
    if (!payload.image_url) {
      throw new Error('Image URL is required');
    }
    
    // Validate URL format
    try {
      new URL(payload.image_url);
    } catch {
      throw new Error('Image URL must be a valid URL (e.g., https://example.com/image.jpg)');
    }
    
    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(payload.difficulty)) {
      throw new Error('Difficulty must be Easy, Medium, or Hard');
    }
    
    const validVegTypes = ['veg', 'non-veg'];
    if (!validVegTypes.includes(payload.veg_type)) {
      throw new Error('Dietary type must be veg or non-veg');
    }
    
    if (editingId) {
      await fetchWithAuth(`/api/admin/recipes/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await fetchWithAuth('/api/admin/recipes', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal();
    await loadRecipes();
    await loadStats();
  } catch (err) {
    if (err?.status === 401 || err?.status === 403 || /unauthorized/i.test(err.message || '')) {
      showAuthRequiredModal('Session expired. Please login again.');
      return;
    }
    alert(err.message);
  }
}

// --- Categories Management ---
async function loadCategories() {
  categories = await fetchWithAuth('/api/categories');
  renderCategoriesList();
}

function renderCategoriesList() {
  el('categoriesList').innerHTML = categories.map(c => `
    <div class="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
      <div class="font-medium text-slate-900">${c.name}</div>
      <div class="flex gap-2">
        <button class="text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-md editCatBtn" data-id="${c.id}">Edit</button>
        <button class="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-md delCatBtn" data-id="${c.id}">Delete</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.editCatBtn').forEach(b => b.addEventListener('click', () => editCategory(parseInt(b.dataset.id, 10))));
  document.querySelectorAll('.delCatBtn').forEach(b => b.addEventListener('click', () => deleteCategory(parseInt(b.dataset.id, 10))));
}

async function createCategory() {
  const name = el('newCategory').value.trim();
  if (!name) return;
  try {
    await fetchWithAuth('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name }) });
    el('newCategory').value = '';
    await loadCategories();
    await loadStats();
  } catch (err) { alert(err.message); }
}

async function editCategory(id) {
  const c = categories.find(x => x.id === id);
  if (!c) return;
  const name = prompt('New category name:', c.name);
  if (!name) return;
  try {
    await fetchWithAuth(`/api/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    await loadCategories();
    await loadRecipes(); // names might change
  } catch (err) { alert(err.message); }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    await fetchWithAuth(`/api/admin/categories/${id}`, { method: 'DELETE' });
    await loadCategories();
    await loadRecipes();
    await loadStats();
  } catch (err) { alert(err.message); }
}

// --- Init ---
export async function initAdmin() {
  if (!requireAdmin()) return; // Auth check

  setupNavigation();
  
  el('addRecipeBtn').addEventListener('click', () => openModal());
  el('closeModalBtn').addEventListener('click', closeModal);
  el('cancelModalBtn').addEventListener('click', closeModal);
  el('modalOverlay').addEventListener('click', (e) => {
      if(e.target === el('modalOverlay')) closeModal();
  });
  el('recipeForm').addEventListener('submit', handleRecipeSubmit);
  
  el('createCatBtn').addEventListener('click', createCategory);

  el('logoutBtn').addEventListener('click', () => {
      clearAuth();
      window.location.href = 'index.html';
  });

  // Initial Data
  await loadCategories(); // needed for recipes options logic
  await Promise.all([
      loadStats(),
      loadRecipes()
  ]);

  // Force default view to ensure title/classes match logic
  document.querySelector('[data-view="dashboard"]').click();

  const searchInput = document.querySelector('input[placeholder="Search recipes..."]');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(applyRecipeSearch, 250));
  }
}

