import { API_BASE } from "./api.js";

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

function toSeed(title, id) {
  const raw = `${title || "recipe"}-${id || ""}`.toLowerCase();
  const seed = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return seed || "recipe";
}

function stripCacheBust(url) {
  if (!url) return "";
  return url.replace(/([?&])cb=\d+/, "$1").replace(/[?&]$/, "");
}

export function normalizeImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return `${API_BASE}${trimmed}`;
  if (/^\.?\//.test(trimmed)) return trimmed;
  if (/^images\//i.test(trimmed)) return `${API_BASE}/${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^httpssource\.unsplash\.comfeatured\?/i.test(trimmed)) {
    return trimmed.replace(/^httpssource\.unsplash\.comfeatured\?/i, "https://source.unsplash.com/featured/?");
  }
  if (/^httpssource\.unsplash\.com\//i.test(trimmed)) {
    return trimmed.replace(/^httpssource\.unsplash\.com\//i, "https://source.unsplash.com/");
  }
  return null;
}

export function buildImageSources({ url, title, id, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }) {
  const sources = [];
  const normalized = normalizeImageUrl(url);
  if (normalized) sources.push(normalized);

  const seed = encodeURIComponent(toSeed(title, id));
  sources.push(`https://picsum.photos/seed/${seed}/${width}/${height}`);

  const label = encodeURIComponent((title || "Recipe").trim());
  sources.push(`https://placehold.co/${width}x${height}/f1f5f9/334155?text=${label}`);

  return Array.from(new Set(sources));
}

function createPlaceholder(wrapper, img) {
  const placeholder = document.createElement("div");
  placeholder.className = "flex items-center justify-center h-full text-brand-200";
  placeholder.innerHTML = '<svg class="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
  img.remove();
  wrapper.insertBefore(placeholder, wrapper.firstChild);
}

function setNextSource(img, sources, startIndexRef) {
  if (startIndexRef.value >= sources.length) return false;
  const src = sources[startIndexRef.value++];
  const cacheBusted = `${src}${src.includes("?") ? "&" : "?"}cb=${Date.now()}`;
  img.src = cacheBusted;
  return true;
}

export function attachImageFallbacks(scope) {
  const imgs = scope.querySelectorAll('img[data-fallback="recipe"]');
  imgs.forEach((img) => {
    if (img.dataset.fallbackBound === "true") return;
    img.dataset.fallbackBound = "true";

    const title = img.getAttribute("data-title") || "";
    const id = img.getAttribute("data-id") || "";
    const width = parseInt(img.getAttribute("data-w") || DEFAULT_WIDTH, 10);
    const height = parseInt(img.getAttribute("data-h") || DEFAULT_HEIGHT, 10);
    const dataSrc = img.getAttribute("data-src") || "";

    const sources = buildImageSources({ url: dataSrc || img.getAttribute("src"), title, id, width, height });
    const current = stripCacheBust(img.currentSrc || img.src || "");
    const startIndex = { value: 0 };
    const currentIndex = sources.findIndex((src) => current && current.startsWith(src));
    if (currentIndex >= 0) startIndex.value = currentIndex + 1;

    img.addEventListener("error", () => {
      const advanced = setNextSource(img, sources, startIndex);
      if (!advanced) {
        const wrapper = img.parentElement;
        if (wrapper) createPlaceholder(wrapper, img);
      }
    });

    if (!img.getAttribute("src")) {
      setNextSource(img, sources, startIndex);
    }
  });
}

export function applyImageWithFallback(img, { url, title, id, width, height }) {
  if (!img) return;
  img.setAttribute("data-fallback", "recipe");
  img.setAttribute("data-title", title || "");
  img.setAttribute("data-id", id || "");
  if (width) img.setAttribute("data-w", String(width));
  if (height) img.setAttribute("data-h", String(height));
  if (url) img.setAttribute("data-src", url);
  attachImageFallbacks(img.parentElement || document);
}
