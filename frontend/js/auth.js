import { fetchWithAuth, setAuth, clearAuth, getUser } from './api.js';

function isAdminRole(role) {
  return String(role || '').toLowerCase() === 'admin';
}

function redirectAdminToDashboard() {
  const user = getUser();
  if (user && isAdminRole(user.role)) {
    window.location.href = 'admin.html';
    return true;
  }
  return false;
}

export function renderNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  if (redirectAdminToDashboard()) return;
  const user = getUser();
  const isLoggedIn = !!user;
  const isAdmin = isAdminRole(user?.role);
  const active = getActiveNavKey();
  const activeClass = 'bg-brand-600 text-white px-3 py-1.5 rounded-full shadow-sm hover:bg-brand-700 transition-colors';
  const baseClass = 'text-slate-600 hover:text-brand-600 transition-colors';
  const navClass = (key) => (active === key ? activeClass : baseClass);

  nav.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <a href="index.html" class="font-display font-bold text-xl md:text-2xl text-slate-800 flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span class="tracking-tight">Food Pal<span class="text-brand-600">.</span></span>
      </a>
      
      <div class="flex items-center gap-6 text-sm font-medium">
        <a href="index.html" class="${navClass('home')}">Home</a>
        <a href="explore.html" class="${navClass('explore')}">Explore</a>
        <a href="ingredients.html" class="${navClass('ingredients')}">Ingredients</a>
        ${isLoggedIn && !isAdmin ? `<a href="favorites.html" class="${navClass('favorites')}">Favorites</a>` : ``}
        
        <div class="flex items-center gap-3 pl-4 border-l border-slate-200">
          <a href="profile.html" class="text-slate-500 hover:text-brand-600 font-medium hidden sm:inline-block transition-colors" title="View Profile">${isLoggedIn ? `Hi, ${user.name.split(' ')[0]}` : ''}</a>
          ${isLoggedIn
            ? `<button id="logoutBtn" class="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-red-600 px-4 py-2 rounded-full transition-all shadow-sm">Logout</button>`
            : `<a class="text-slate-700 hover:text-brand-600 transition-colors px-2" href="login.html">Login</a>
               <a class="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-full transition-all shadow-md hover:shadow-lg transform active:scale-95" href="register.html">Sign Up</a>`
          }
        </div>
      </div>
    </div>
  `;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAuth();
      window.location.href = 'index.html';
    });
  }
}

function getActiveNavKey() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('admin') || path.includes('profile') || path.includes('login') || path.includes('register')) {
    return null;
  }
  if (path.includes('explore')) return 'explore';
  if (path.includes('ingredients')) return 'ingredients';
  if (path.includes('favorites')) return 'favorites';
  if (path === '/' || path.endsWith('/index.html') || path.endsWith('index.html')) return 'home';
  return null;
}

function showError(fieldId, message) {
  const el = document.getElementById(fieldId);
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

function clearErrors() {
  document.querySelectorAll('.text-red-500.text-xs').forEach(el => el.classList.add('hidden'));
}

export async function handleLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const msg = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    msg.textContent = '';
    
    const email = form.email.value.trim();
    const password = form.password.value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let isValid = true;

    if (!email) {
      showError('emailError', 'Email is required.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('emailError', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!password) {
      showError('passwordError', 'Password is required.');
      isValid = false;
    } else if (password.length < 6) {
      showError('passwordError', 'Password must be at least 6 characters.');
      isValid = false;
    }

    if (!isValid) return;

    try {
      const data = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setAuth(data.token, data.user);
      if (data.user.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'index.html';
      }
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'text-red-600';
    }
  });
}

export async function handleRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  const msg = document.getElementById('message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    msg.textContent = '';

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    
    // Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let isValid = true;

    if (!name) {
      showError('nameError', 'Full name is required.');
      isValid = false;
    }

    if (!email) {
      showError('emailError', 'Email is required.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('emailError', 'Please enter a valid email address.');
      isValid = false;
    }

    if (!password) {
      showError('passwordError', 'Password is required.');
      isValid = false;
    } else if (password.length < 6) {
      showError('passwordError', 'Password must be at least 6 characters.');
      isValid = false;
    }

    if (!isValid) return;

    try {
      await fetchWithAuth('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
      msg.textContent = 'Registered! Now login.';
      msg.className = 'text-green-600';
      setTimeout(() => window.location.href = 'login.html', 800);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'text-red-600';
    }
  });
}

export function requireAuth(redirect = 'login.html') {
  const user = getUser();
  if (!user) window.location.href = redirect;
}

export function requireAdmin() {
  const user = getUser();
  if (!user || !isAdminRole(user.role)) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

export function requireUser() {
  const user = getUser();
  if (!user) {
    window.location.href = 'login.html';
    return false;
  }
  if (isAdminRole(user.role)) {
    window.location.href = 'admin.html';
    return false;
  }
  return true;
}
