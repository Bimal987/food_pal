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
let cuisines = [];
let recipes = [];
let users = [];
let allAdminRecipes = [];
let visibleRecipes = [];
let visibleUsers = [];
let editingId = null;
let passwordUserId = null;
const numberFormatter = new Intl.NumberFormat();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isValidRecipeImagePath(value) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  return /^\/?images\/[^?#]+\.(jpe?g|png|webp|gif)(\?[^#]*)?(#.*)?$/i.test(value);
}

function renderDashboardList(targetId, items, options) {
  const target = el(targetId);
  if (!target) return;

  if (!items || !items.length) {
    target.innerHTML = `<div class="dashboard-empty rounded-xl px-4 py-5 text-sm text-slate-500">${options.emptyText}</div>`;
    return;
  }

  target.innerHTML = items.map((item) => {
    const title = options.getTitle(item);
    const meta = options.getMeta(item);
    return `
      <div class="dashboard-list-item rounded-xl px-4 py-3">
        <div class="font-semibold text-slate-800 truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        ${meta ? `<div class="mt-1 text-xs font-medium text-slate-400">${escapeHtml(meta)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// --- Navigation & View Switching ---
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-item');
  const titles = {
    dashboard: 'Admin Dashboard',
    users: 'User Management'
  };
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      navBtns.forEach(b => b.classList.remove('active', 'bg-slate-800', 'text-white'));
      navBtns.forEach(b => b.classList.add('hover:bg-slate-800', 'hover:text-white')); // helper to reset
      
      btn.classList.add('active', 'bg-slate-800', 'text-white');
      
      // Update Title
      const viewName = btn.dataset.view;
      el('pageTitle').textContent = titles[viewName] || viewName.charAt(0).toUpperCase() + viewName.slice(1);

      // Show Section
      document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
      const section = el(`view-${viewName}`);
      if (section) section.classList.remove('hidden');
    });
  });
}

// --- Dashboard Stats ---
async function loadStats() {
  try {
    const stats = await fetchWithAuth('/api/admin/stats');
    el('stat-users').textContent = numberFormatter.format(stats.users ?? 0);
    el('stat-recipes').textContent = numberFormatter.format(stats.recipes ?? 0);
    el('quick-total-categories').textContent = numberFormatter.format(stats.categories ?? 0);
    el('quick-total-cuisines').textContent = numberFormatter.format(stats.cuisines ?? 0);

    const mostViewed = stats.mostViewedRecipe;
    if (mostViewed) {
      const title = mostViewed.title || 'Untitled recipe';
      const views = mostViewed.view_count || 0;
      el('stat-most-viewed-title').textContent = title;
      el('stat-most-viewed-title').title = title;
      el('stat-most-viewed-count').textContent = `${numberFormatter.format(views)} ${views === 1 ? 'view' : 'views'}`;
    } else {
      el('stat-most-viewed-title').textContent = 'No recipe views yet';
      el('stat-most-viewed-title').title = 'No recipe views yet';
      el('stat-most-viewed-count').textContent = '0 views';
    }

    renderDashboardList('recentRecipesList', stats.recentRecipes || [], {
      emptyText: 'No recipes added yet.',
      getTitle: (recipe) => recipe.title || 'Untitled recipe',
      getMeta: (recipe) => formatDate(recipe.created_at)
    });

    renderDashboardList('recentUsersList', stats.recentUsers || [], {
      emptyText: 'No registered users yet.',
      getTitle: (user) => user.name || user.email || 'Unnamed user',
      getMeta: (user) => formatDate(user.created_at)
    });

    const topCategory = stats.topCategory;
    if (topCategory) {
      el('topCategoryName').textContent = topCategory.name || 'Uncategorized';
      el('topCategoryName').title = topCategory.name || 'Uncategorized';
      const recipeCount = topCategory.recipe_count || 0;
      el('topCategoryCount').textContent = `${numberFormatter.format(recipeCount)} ${recipeCount === 1 ? 'recipe' : 'recipes'}`;
    } else {
      el('topCategoryName').textContent = 'No data available';
      el('topCategoryName').title = 'No data available';
      el('topCategoryCount').textContent = 'Add recipes to generate category data';
    }

    const latestRecipeTitle = stats.latestRecipe?.title || 'No recipe added yet';
    el('quick-latest-recipe').textContent = latestRecipeTitle;
    el('quick-latest-recipe').title = latestRecipeTitle;
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

// --- Recipes Management ---
function optionCats(selectedId) {
  return categories.map(c => `<option value="${c.id}" ${String(selectedId)===String(c.id)?'selected':''}>${c.name}</option>`).join('');
}

function optionCuisines(selectedId) {
  return cuisines.map(c => `<option value="${c.id}" ${String(selectedId)===String(c.id)?'selected':''}>${c.name}</option>`).join('');
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

// --- Users Management ---
function renderUserRows(list) {
  const tbody = el('usersTbody');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `
      <tr class="border-b">
        <td class="p-6 text-center text-slate-400" colspan="5">No users found.</td>
      </tr>
    `;
    return;
  }

  const currentUser = getUser();
  const currentUserId = Number(currentUser?.id);

  tbody.innerHTML = list.map(user => {
    const isCurrentUser = Number(user.id) === currentUserId;
    return `
      <tr class="border-b transition hover:bg-slate-50" data-user-row="${user.id}">
        <td class="p-4">${escapeHtml(user.id)}</td>
        <td class="p-4 font-medium text-slate-900">${escapeHtml(user.name || 'Unnamed user')}</td>
        <td class="p-4 text-slate-600">${escapeHtml(user.email || '')}</td>
        <td class="p-4 text-slate-600">${escapeHtml(formatDate(user.created_at) || '-')}</td>
        <td class="p-4">
          <div class="flex flex-wrap gap-2">
            <button class="text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-md changePasswordBtn" data-id="${user.id}">Change Password</button>
            <button class="text-xs font-semibold ${isCurrentUser ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-red-600 hover:text-red-700 bg-red-50'} px-3 py-1.5 rounded-md deleteUserBtn" data-id="${user.id}" ${isCurrentUser ? 'disabled title="You cannot delete your own account"' : ''}>Delete User</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.changePasswordBtn').forEach(btn => {
    btn.addEventListener('click', () => openPasswordModal(parseInt(btn.dataset.id, 10)));
  });
  document.querySelectorAll('.deleteUserBtn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => deleteUser(parseInt(btn.dataset.id, 10)));
  });
}

async function loadUsers() {
  try {
    users = await fetchWithAuth('/api/admin/users');
    visibleUsers = Array.isArray(users) ? users.slice() : [];
    renderUserRows(visibleUsers);
  } catch (err) {
    console.error('Failed to load users', err);
  }
}

function applyUserSearch() {
  const input = el('userSearch');
  if (!input) return;
  const q = (input.value || '').trim().toLowerCase();
  if (!q) {
    visibleUsers = users.slice();
    renderUserRows(visibleUsers);
    return;
  }

  visibleUsers = users.filter(user => {
    const id = String(user.id || '');
    const name = String(user.name || '').toLowerCase();
    const email = String(user.email || '').toLowerCase();
    return id.includes(q) || name.includes(q) || email.includes(q);
  });
  renderUserRows(visibleUsers);
}

const passwordModal = el('passwordModalOverlay');
const passwordModalContent = el('passwordModalContent');

function setPasswordModalMessage(message, type = 'error') {
  const target = el('passwordModalMessage');
  if (!target) return;
  target.textContent = message || '';
  target.classList.toggle('hidden', !message);
  target.classList.toggle('text-red-600', type === 'error');
  target.classList.toggle('text-brand-600', type === 'success');
}

function openPasswordModal(userId) {
  passwordUserId = userId;
  const user = users.find(item => Number(item.id) === Number(userId));
  el('passwordModalTitle').textContent = `Change Password${user?.name ? ` - ${user.name}` : ''}`;
  el('passwordForm').reset();
  setPasswordModalMessage('');
  passwordModal.classList.remove('hidden');
  setTimeout(() => {
    passwordModalContent.classList.remove('scale-95', 'opacity-0');
    passwordModalContent.classList.add('scale-100', 'opacity-100');
  }, 10);
}

function closePasswordModal() {
  passwordModalContent.classList.remove('scale-100', 'opacity-100');
  passwordModalContent.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    passwordModal.classList.add('hidden');
    passwordUserId = null;
  }, 300);
}

async function handlePasswordSubmit(e) {
  e.preventDefault();
  const newPassword = el('newPassword').value;
  const confirmPassword = el('confirmPassword').value;

  if (!passwordUserId) {
    setPasswordModalMessage('User selection is missing.');
    return;
  }
  if (newPassword.length < 6) {
    setPasswordModalMessage('Password must be at least 6 characters long.');
    return;
  }
  if (newPassword !== confirmPassword) {
    setPasswordModalMessage('Passwords must match.');
    return;
  }

  try {
    const result = await fetchWithAuth('/api/admin/users/update-password', {
      method: 'POST',
      body: JSON.stringify({ userId: passwordUserId, password: newPassword })
    });
    setPasswordModalMessage(result?.message || 'Password updated successfully', 'success');
    setTimeout(closePasswordModal, 700);
  } catch (err) {
    setPasswordModalMessage(err.message || 'Unable to update password.');
  }
}

async function deleteUser(id) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    const result = await fetchWithAuth('/api/admin/users/delete', {
      method: 'POST',
      body: JSON.stringify({ userId: id })
    });
    users = users.filter(user => Number(user.id) !== Number(id));
    visibleUsers = visibleUsers.filter(user => Number(user.id) !== Number(id));
    renderUserRows(visibleUsers);
    await loadStats();
    alert(result?.message || 'User deleted successfully');
  } catch (err) {
    alert(err.message || 'Unable to delete user.');
  }
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
  el('recipeCuisine').innerHTML = '<option value="">Select Cuisine</option>' + optionCuisines('');

  if (id) {
    const r = recipes.find(x => x.id === id);
    if (r) {
        // We need full details for ingredients
        fetchWithAuth(`/api/recipes/${id}?trackView=false`).then(detail => {
            el('title').value = detail.title || '';
            el('description').value = detail.description || '';
            el('steps').value = detail.steps || '';
            el('cook_time').value = detail.cook_time || 0;
            el('difficulty').value = detail.difficulty || 'Medium';
            el('recipeCuisine').value = detail.cuisine_id || '';
            el('type').value = detail.type || detail.veg_type || 'veg';
            el('image_url').value = detail.image_url || '';
            el('recipeCategory').value = detail.category_id || '';
            el('ingredients').value = (detail.ingredients || []).map(i => i.display_text || i.name).join('\n');
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
    cuisine_id: el('recipeCuisine').value ? parseInt(el('recipeCuisine').value, 10) : null,
    type: el('type').value,
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
    
    if (!isValidRecipeImagePath(payload.image_url)) {
      throw new Error('Image must be a valid URL or local path (e.g., https://example.com/image.jpg or /images/recipe.jpg)');
    }
    
    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(payload.difficulty)) {
      throw new Error('Difficulty must be Easy, Medium, or Hard');
    }
    
    const validTypes = ['veg', 'nonveg', 'vegan'];
    if (!validTypes.includes(payload.type)) {
      throw new Error('Type must be veg, nonveg, or vegan');
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

async function loadCuisines() {
  cuisines = await fetchWithAuth('/api/cuisines');
  renderCuisinesList();
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

function renderCuisinesList() {
  el('cuisinesList').innerHTML = cuisines.map(c => `
    <div class="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
      <div class="font-medium text-slate-900">${c.name}</div>
      <div class="flex gap-2">
        <button class="text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-md editCuisineBtn" data-id="${c.id}">Edit</button>
        <button class="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-md delCuisineBtn" data-id="${c.id}">Delete</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.editCuisineBtn').forEach(b => b.addEventListener('click', () => editCuisine(parseInt(b.dataset.id, 10))));
  document.querySelectorAll('.delCuisineBtn').forEach(b => b.addEventListener('click', () => deleteCuisine(parseInt(b.dataset.id, 10))));
}

async function createCuisine() {
  const name = el('newCuisine').value.trim();
  if (!name) return;
  try {
    await fetchWithAuth('/api/admin/cuisines', { method: 'POST', body: JSON.stringify({ name }) });
    el('newCuisine').value = '';
    await loadCuisines();
    await loadStats();
  } catch (err) { alert(err.message); }
}

async function editCuisine(id) {
  const c = cuisines.find(x => x.id === id);
  if (!c) return;
  const name = prompt('New cuisine name:', c.name);
  if (!name) return;
  try {
    await fetchWithAuth(`/api/admin/cuisines/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    await loadCuisines();
    await loadRecipes();
  } catch (err) { alert(err.message); }
}

async function deleteCuisine(id) {
  if (!confirm('Delete this cuisine?')) return;
  try {
    await fetchWithAuth(`/api/admin/cuisines/${id}`, { method: 'DELETE' });
    await loadCuisines();
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
  el('createCuisineBtn').addEventListener('click', createCuisine);
  el('closePasswordModalBtn').addEventListener('click', closePasswordModal);
  el('cancelPasswordModalBtn').addEventListener('click', closePasswordModal);
  el('passwordModalOverlay').addEventListener('click', (e) => {
      if(e.target === el('passwordModalOverlay')) closePasswordModal();
  });
  el('passwordForm').addEventListener('submit', handlePasswordSubmit);

  el('logoutBtn').addEventListener('click', () => {
      clearAuth();
      window.location.href = 'index.html';
  });

  // Initial Data
  await Promise.all([loadCategories(), loadCuisines()]); // needed for recipes options logic
  await Promise.all([
      loadStats(),
      loadRecipes(),
      loadUsers()
  ]);

  // Force default view to ensure title/classes match logic
  document.querySelector('[data-view="dashboard"]').click();

  const searchInput = document.querySelector('input[placeholder="Search recipes..."]');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(applyRecipeSearch, 250));
  }

  const userSearch = el('userSearch');
  if (userSearch) {
    userSearch.addEventListener('input', debounce(applyUserSearch, 250));
  }
}
