import { clearAuth, fetchWithAuth, getUser } from './api.js';
import { renderNavbar, requireUser } from './auth.js';
import { loadFavorites } from './favorites.js';
import { attachImageFallbacks, buildImageSources, normalizeImageUrl } from './image-utils.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setTextAll(selector, value) {
  document.querySelectorAll(selector).forEach(el => {
    el.textContent = value;
  });
}

async function getProfileData() {
  const fallback = getUser() || {};
  try {
    return await fetchWithAuth('/api/auth/me');
  } catch (err) {
    console.error('Failed to load profile', err);
    return fallback;
  }
}

async function getReviews() {
  return fetchWithAuth('/api/ratings/me');
}

async function getFavorites() {
  return fetchWithAuth('/api/favorites');
}

function fillUserInfo(profile) {
  const name = profile.name || 'User';
  setText('userName', name);
  setText('userEmail', profile.email || '');
  setText('initials', name.charAt(0).toUpperCase());
  setText('welcomeName', name.split(' ')[0] || name);
  setTextAll('[data-profile-name]', name);
  setTextAll('[data-profile-email]', profile.email || '');
  setTextAll('[data-profile-initials]', name.charAt(0).toUpperCase());
  setValue('profileNameInput', name);
  setValue('profileEmailInput', profile.email || '');
}

function reviewCard(r) {
  const imageUrl = normalizeImageUrl(r.image_url);
  const imageSources = buildImageSources({ url: imageUrl, title: r.title, id: r.recipe_id, width: 160, height: 160 });

  return `
    <article class="profile-review-card flex flex-col sm:flex-row gap-4">
      <div class="profile-review-image h-20 w-20 flex-shrink-0 bg-slate-100 rounded-xl overflow-hidden">
        ${imageSources.length ? `<img src="${imageSources[0]}" data-src="${imageUrl || ""}" data-title="${r.title}" data-id="${r.recipe_id}" data-w="160" data-h="160" data-fallback="recipe" class="w-full h-full object-cover" alt="${r.title}">` : `<div class="flex items-center justify-center h-full text-slate-300 text-xs">No image</div>`}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <a href="recipe.html?id=${r.recipe_id}" class="profile-review-title font-bold text-lg text-slate-800 hover:text-brand-600 transition-colors font-display">${r.title}</a>
          <span class="profile-review-date text-xs font-medium text-slate-400">${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div class="profile-review-rating flex items-center gap-1 mt-2">
          ${Array(5).fill(0).map((_, i) => `<span class="text-sm ${i < r.rating ? 'text-amber-500' : 'text-slate-200'}">&#9733;</span>`).join('')}
          <span class="text-sm font-bold text-slate-700 ml-1">${r.rating}/5</span>
        </div>
        ${r.review ? `<p class="profile-review-text text-slate-600 text-sm mt-3">"${r.review}"</p>` : ''}
      </div>
    </article>
  `;
}

async function loadCounts() {
  const [reviews, favorites] = await Promise.all([
    getReviews().catch(() => []),
    getFavorites().catch(() => [])
  ]);
  setText('ratingsCount', reviews.length);
  setText('favCount', favorites.length);
  setTextAll('[data-ratings-count]', reviews.length);
  setTextAll('[data-favorites-count]', favorites.length);
  return { reviews, favorites };
}

async function loadReviewsList() {
  const list = document.getElementById('ratingsList');
  if (!list) return [];
  list.innerHTML = `<div class="empty-state profile-empty-state">Loading reviews...</div>`;

  try {
    const reviews = await getReviews();
    setText('ratingsCount', reviews.length);

    if (!reviews.length) {
      list.innerHTML = `<div class="empty-state profile-empty-state">You haven't reviewed any recipes yet.</div>`;
      return reviews;
    }

    list.innerHTML = reviews.map(reviewCard).join('');
    attachImageFallbacks(list);
    return reviews;
  } catch (err) {
    list.innerHTML = `<div class="text-red-500 p-4 bg-white rounded-xl border border-red-100">${err.message}</div>`;
    return [];
  }
}

async function loadDashboardReviewsList() {
  const list = document.getElementById('dashboardRatingsList');
  const status = document.getElementById('dashboardReviewsStatus');
  if (!list || !status) return [];

  status.textContent = 'Loading your reviews...';
  list.innerHTML = '';

  try {
    const reviews = await getReviews();
    status.textContent = reviews.length ? `${reviews.length} saved review${reviews.length === 1 ? '' : 's'}.` : '';

    if (!reviews.length) {
      list.innerHTML = `
        <div class="empty-state profile-empty-state">
          <p class="text-sm">Rate recipes after you try them and your thoughts will appear here.</p>
          <a href="explore.html" class="inline-flex mt-4 px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">Explore Recipes</a>
        </div>`;
      return reviews;
    }

    list.innerHTML = reviews.map(reviewCard).join('');
    attachImageFallbacks(list);
    return reviews;
  } catch (err) {
    status.textContent = 'Could not load reviews.';
    list.innerHTML = `<div class="text-red-500 p-4 bg-white rounded-xl border border-red-100">${err.message}</div>`;
    return [];
  }
}

function initContactForm() {
  const form = document.getElementById('contactForm');
  const message = document.getElementById('contactMessage');
  if (!form || !message) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    message.textContent = 'Thank you. Your message has been prepared for Food Pal support.';
    form.reset();
  });
}

function showProfileMessage(id, message, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `profile-form-message ${type === 'error' ? 'is-error' : 'is-success'}`;
}

function initPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      button.classList.toggle('is-visible', input.type === 'text');
    });
  });
}

function updateStoredUser(user) {
  const current = getUser() || {};
  localStorage.setItem('user', JSON.stringify({ ...current, ...user }));
}

function initProfileAccountForms() {
  const profileForm = document.getElementById('profileDetailsForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = profileForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const data = await fetchWithAuth('/api/auth/me', {
          method: 'PUT',
          body: JSON.stringify({
            name: profileForm.name.value.trim(),
            email: document.getElementById('profileEmailInput')?.value || getUser()?.email || ''
          })
        });
        updateStoredUser(data.user);
        fillUserInfo(data.user);
        renderNavbar();
        showProfileMessage('profileDetailsMessage', data.message || 'Profile updated.');
      } catch (err) {
        showProfileMessage('profileDetailsMessage', err.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  const passwordForm = document.getElementById('changePasswordForm');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = passwordForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const data = await fetchWithAuth('/api/auth/password', {
          method: 'PUT',
          body: JSON.stringify({
            oldPassword: passwordForm.oldPassword.value,
            newPassword: passwordForm.newPassword.value,
            confirmPassword: passwordForm.confirmPassword.value
          })
        });
        passwordForm.reset();
        showProfileMessage('changePasswordMessage', data.message || 'Password updated.');
      } catch (err) {
        showProfileMessage('changePasswordMessage', err.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  const deleteForm = document.getElementById('deleteAccountForm');
  if (deleteForm) {
    deleteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!confirm('Delete your Food Pal account? This cannot be undone.')) return;
      const button = deleteForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await fetchWithAuth('/api/auth/me', {
          method: 'DELETE',
          body: JSON.stringify({ password: deleteForm.password.value })
        });
        clearAuth();
        window.location.href = 'index.html';
      } catch (err) {
        showProfileMessage('deleteAccountMessage', err.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });
  }
}

const dashboardSections = new Set(['profile', 'favorites', 'reviews', 'contact']);

function getDashboardSection() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('section') || 'profile';
  return dashboardSections.has(requested) ? requested : 'profile';
}

function setDashboardSection(section) {
  document.querySelectorAll('[data-dashboard-section]').forEach(panel => {
    const isActive = panel.dataset.dashboardSection === section;
    panel.hidden = !isActive;
  });

  document.querySelectorAll('.dashboard-nav [data-dashboard-nav]').forEach(link => {
    const isActive = link.dataset.dashboardNav === section;
    link.classList.toggle('is-active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  const title = document.querySelector(`[data-dashboard-nav="${section}"]`)?.dataset.title || 'Profile';
  document.title = `${title} - Dashboard - Food Pal`;
}

function initDashboardNavigation() {
  const links = document.querySelectorAll('[data-dashboard-nav], [data-dashboard-switch]');
  links.forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const section = link.dataset.dashboardNav || link.dataset.dashboardSwitch;
      const url = new URL(window.location.href);
      url.searchParams.set('section', section);
      window.history.pushState({ section }, '', url);
      setDashboardSection(section);
    });
  });

  window.addEventListener('popstate', () => setDashboardSection(getDashboardSection()));
}

async function initUserPage() {
  if (!requireUser()) return null;
  renderNavbar();
  const profile = await getProfileData();
  fillUserInfo(profile);
  return profile;
}

export async function initDashboard() {
  const profile = await initUserPage();
  if (!profile) return;
  initDashboardNavigation();
  initContactForm();
  initPasswordToggles();
  initProfileAccountForms();
  setDashboardSection(getDashboardSection());
  await Promise.all([
    loadCounts(),
    loadFavorites({
      gridId: 'dashboardFavoritesGrid',
      statusId: 'dashboardFavoritesStatus',
      emptyClass: 'dashboard-favorites-empty'
    }),
    loadDashboardReviewsList()
  ]);
}

export async function initProfile() {
  const profile = await initUserPage();
  if (!profile) return;
  initPasswordToggles();
  initProfileAccountForms();
  await loadCounts();
}

export async function initReviews() {
  const profile = await initUserPage();
  if (!profile) return;
  await loadReviewsList();
}

export async function initContact() {
  const profile = await initUserPage();
  if (!profile) return;
  initContactForm();
}
