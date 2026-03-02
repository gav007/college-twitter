const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
const themeToggles = Array.from(document.querySelectorAll('[data-theme-toggle]'));
const compactToggles = Array.from(document.querySelectorAll('[data-compact-toggle]'));
const THEME_STORAGE_KEY = 'loopfeed-theme';
const COMPACT_STORAGE_KEY = 'loopfeed-compact-cards';
const rootElement = document.documentElement;

function formatCompactCount(value) {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);
  if (absolute < 1000) {
    return String(numeric);
  }
  if (absolute < 1000000) {
    const compact = Math.round((numeric / 1000) * 10) / 10;
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
  }
  const compact = Math.round((numeric / 1000000) * 10) / 10;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}M`;
}

function readThemePreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark') {
      return value;
    }
  } catch (err) {
    console.error(err);
  }

  return null;
}

function writeThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.error(err);
  }
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveTheme() {
  const current = rootElement.getAttribute('data-theme');
  if (current === 'light' || current === 'dark') {
    return current;
  }

  return getSystemTheme();
}

function updateThemeToggleLabel() {
  if (!themeToggles.length) {
    return;
  }

  const effectiveTheme = getEffectiveTheme();
  const nextTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
  themeToggles.forEach((toggle) => {
    toggle.textContent = `Switch to ${nextTheme}`;
    toggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
  });
}

function applyStoredTheme() {
  const preference = readThemePreference();
  if (preference) {
    rootElement.setAttribute('data-theme', preference);
  } else {
    rootElement.removeAttribute('data-theme');
  }

  updateThemeToggleLabel();
}

if (themeToggles.length) {
  applyStoredTheme();

  themeToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const nextTheme = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
      rootElement.setAttribute('data-theme', nextTheme);
      writeThemePreference(nextTheme);
      updateThemeToggleLabel();
    });
  });
}

function applyCompactMode(enabled) {
  document.body.classList.toggle('compact-cards', enabled);
  compactToggles.forEach((toggle) => {
    toggle.textContent = enabled ? 'Comfortable' : 'Compact';
    toggle.setAttribute('aria-label', enabled ? 'Switch to comfortable cards' : 'Switch to compact cards');
  });
}

function readCompactPreference() {
  try {
    return localStorage.getItem(COMPACT_STORAGE_KEY) === '1';
  } catch (_err) {
    return false;
  }
}

if (compactToggles.length) {
  applyCompactMode(readCompactPreference());

  compactToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const nextEnabled = !document.body.classList.contains('compact-cards');
      applyCompactMode(nextEnabled);
      try {
        localStorage.setItem(COMPACT_STORAGE_KEY, nextEnabled ? '1' : '0');
      } catch (_err) {
        // Ignore localStorage errors in private mode.
      }
    });
  });
}

(function initLiveNewPostsPill() {
  const pill = document.querySelector('[data-new-posts-pill]');
  const liveRegion = document.querySelector('[data-feed-live-region]');
  if (!pill) {
    return;
  }

  const feedTab = (pill.getAttribute('data-feed-tab') || 'following').trim();
  const since = (pill.getAttribute('data-feed-since') || '').trim();
  if (!since) {
    return;
  }

  const buildRefreshUrl = () => {
    const params = new URLSearchParams();
    params.set('tab', feedTab);
    params.set('since', since);
    return `/feed/new-count?${params.toString()}`;
  };

  let lastCount = 0;
  async function refreshCount() {
    try {
      const response = await fetch(buildRefreshUrl(), {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const count = Number(payload && payload.count ? payload.count : 0);
      if (count > 0) {
        pill.hidden = false;
        pill.textContent = `${count} new post${count === 1 ? '' : 's'}`;
        if (liveRegion && count !== lastCount) {
          liveRegion.textContent = `${count} new post${count === 1 ? '' : 's'} available`;
        }
      } else {
        pill.hidden = true;
        if (liveRegion && lastCount > 0) {
          liveRegion.textContent = 'Feed is up to date';
        }
      }
      lastCount = count;
    } catch (_err) {
      // Polling is best-effort and should fail silently.
    }
  }

  pill.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', feedTab);
    url.searchParams.delete('cursorCreatedAt');
    url.searchParams.delete('cursorId');
    window.location.href = `${url.pathname}${url.search}`;
  });

  window.setTimeout(refreshCount, 3000);
  window.setInterval(refreshCount, 25000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshCount();
    }
  });
})();

(function initFileInputLabels() {
  document.querySelectorAll('input[type="file"][data-file-name-output]').forEach((input) => {
    const outputSelector = input.getAttribute('data-file-name-output');
    const output = outputSelector ? document.querySelector(outputSelector) : null;
    if (!output) {
      return;
    }

    const defaultText = output.textContent || 'No file selected';

    const refresh = () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      output.textContent = file ? file.name : defaultText;
    };

    input.addEventListener('change', refresh);
    if (input.form) {
      input.form.addEventListener('reset', () => {
        window.setTimeout(refresh, 0);
      });
    }
  });
})();

// Mobile nav toggle
(function initMobileNav() {
  const hamburger = document.querySelector('.nav-hamburger');
  const menu = document.getElementById('nav-menu');
  if (!hamburger || !menu) {
    return;
  }

  hamburger.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  menu.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('click', () => {
      menu.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open menu');
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!hamburger.contains(target) && !menu.contains(target)) {
      menu.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open menu');
    }
  });
})();

// Global compose modal behavior
(function initGlobalComposeModal() {
  const modal = document.getElementById('global-compose-modal');
  if (!modal) {
    return;
  }

  const openButtons = document.querySelectorAll('[data-open-compose]');
  openButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (modal.open) {
        return;
      }
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.setAttribute('open', 'open');
      }
    });
  });

  const closeButtons = modal.querySelectorAll('[data-close-compose]');
  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.removeAttribute('open');
      }
    });
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal && typeof modal.close === 'function') {
      modal.close();
    }
  });

  modal.addEventListener('close', () => {
    const form = modal.querySelector('form');
    if (form) {
      form.reset();
    }

    const counter = modal.querySelector('.char-counter');
    if (counter) {
      counter.textContent = '280';
      counter.classList.remove('danger');
    }
  });
})();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_TARGET_SIZE = 256;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function hasAllowedImageExtension(fileName) {
  const lower = (fileName || '').toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function validateImageFileWithLimit(file, maxBytes, sizeErrorMessage) {
  if (!file) {
    return '';
  }

  if (file.size > maxBytes) {
    return sizeErrorMessage;
  }

  const mimeType = (file.type || '').toLowerCase();
  if (mimeType && !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return 'Only JPG, JPEG, PNG, and WebP images are allowed.';
  }

  if (!hasAllowedImageExtension(file.name)) {
    return 'Only JPG, JPEG, PNG, and WebP images are allowed.';
  }

  return '';
}

function validateImageFile(file) {
  return validateImageFileWithLimit(file, MAX_IMAGE_BYTES, 'Image must be 5 MB or smaller.');
}

function validateAvatarFile(file) {
  if (!file) {
    return 'Please choose an avatar image to upload.';
  }

  return validateImageFileWithLimit(file, MAX_AVATAR_BYTES, 'Avatar image must be 1 MB or smaller.');
}

function renderUploadError(form, message) {
  const errorEl = form.querySelector('[data-upload-error]');
  if (!errorEl) {
    return;
  }

  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }

  errorEl.hidden = false;
  errorEl.textContent = message;
}

function setSingleFileInput(input, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
}

function getAvatarOutputMimeType(file) {
  const mimeType = (file && file.type ? file.type : '').toLowerCase();
  if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return mimeType;
  }

  return 'image/jpeg';
}

function extensionForMimeType(mimeType) {
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
}

(function initUploadValidation() {
  document.querySelectorAll('form[enctype="multipart/form-data"]').forEach((form) => {
    const action = (form.getAttribute('action') || '').split('?')[0];
    if (action !== '/tweets') {
      return;
    }

    const imageInput = form.querySelector('input[name="image"]');
    if (!imageInput) {
      return;
    }

    imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      const message = validateImageFile(file);
      if (message) {
        imageInput.value = '';
      }
      renderUploadError(form, message);
    });

    form.addEventListener('submit', (event) => {
      const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      const message = validateImageFile(file);
      if (message) {
        event.preventDefault();
        renderUploadError(form, message);
      } else {
        renderUploadError(form, '');
      }
    });

    form.addEventListener('reset', () => {
      renderUploadError(form, '');
    });
  });
})();

(function initAvatarUploadValidation() {
  document.querySelectorAll('form[action="/settings/avatar"]').forEach((form) => {
    const imageInput = form.querySelector('input[name="avatar_image"]');
    const errorEl = form.querySelector('[data-avatar-upload-error]');
    const cropper = form.querySelector('[data-avatar-cropper]');
    const cropStage = form.querySelector('[data-avatar-cropper-stage]');
    const cropImage = form.querySelector('[data-avatar-cropper-image]');
    const zoomInput = form.querySelector('[data-avatar-zoom]');
    if (!imageInput || !errorEl || !cropper || !cropStage || !cropImage || !zoomInput) {
      return;
    }

    const state = {
      sourceDataUrl: '',
      imageLoaded: false,
      width: 0,
      height: 0,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      dragging: false,
      dragPointerId: null,
      dragStartX: 0,
      dragStartY: 0,
      dragOriginOffsetX: 0,
      dragOriginOffsetY: 0,
      submitting: false
    };

    const getStageSize = () => {
      return cropStage.clientWidth || 260;
    };

    const clampOffsets = () => {
      if (!state.imageLoaded) {
        return;
      }

      const stageSize = getStageSize();
      const scaledWidth = state.width * state.scale;
      const scaledHeight = state.height * state.scale;
      const minX = Math.min(0, stageSize - scaledWidth);
      const minY = Math.min(0, stageSize - scaledHeight);
      state.offsetX = Math.min(0, Math.max(minX, state.offsetX));
      state.offsetY = Math.min(0, Math.max(minY, state.offsetY));
    };

    const renderCropImage = () => {
      if (!state.imageLoaded) {
        cropImage.style.transform = '';
        return;
      }

      cropImage.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
      cropImage.style.transformOrigin = 'top left';
    };

    const updateScale = (nextZoom) => {
      if (!state.imageLoaded) {
        return;
      }

      const zoom = Number(nextZoom);
      state.zoom = Number.isFinite(zoom) ? Math.min(3, Math.max(1, zoom)) : 1;
      const stageSize = getStageSize();
      const baseScale = Math.max(stageSize / state.width, stageSize / state.height);
      const nextScale = baseScale * state.zoom;

      const centerImageX = (stageSize / 2 - state.offsetX) / state.scale;
      const centerImageY = (stageSize / 2 - state.offsetY) / state.scale;

      state.scale = nextScale;
      state.offsetX = stageSize / 2 - centerImageX * state.scale;
      state.offsetY = stageSize / 2 - centerImageY * state.scale;

      clampOffsets();
      renderCropImage();
    };

    const renderAvatarError = (message) => {
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }

      errorEl.hidden = false;
      errorEl.textContent = message;
    };

    const clearCropper = () => {
      state.sourceDataUrl = '';
      state.imageLoaded = false;
      state.width = 0;
      state.height = 0;
      state.scale = 1;
      state.offsetX = 0;
      state.offsetY = 0;
      state.zoom = 1;
      state.dragging = false;
      state.dragPointerId = null;

      cropImage.removeAttribute('src');
      cropper.hidden = true;
      zoomInput.value = '1';
      cropStage.classList.remove('is-dragging');
      renderCropImage();
    };

    const initializeCropper = () => {
      const stageSize = getStageSize();
      state.scale = Math.max(stageSize / state.width, stageSize / state.height);
      state.offsetX = (stageSize - state.width * state.scale) / 2;
      state.offsetY = (stageSize - state.height * state.scale) / 2;
      state.zoom = 1;
      zoomInput.value = '1';
      clampOffsets();
      renderCropImage();
    };

    const finishDrag = () => {
      state.dragging = false;
      state.dragPointerId = null;
      cropStage.classList.remove('is-dragging');
    };

    cropStage.addEventListener('pointerdown', (event) => {
      if (!state.imageLoaded) {
        return;
      }

      state.dragging = true;
      state.dragPointerId = event.pointerId;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.dragOriginOffsetX = state.offsetX;
      state.dragOriginOffsetY = state.offsetY;
      cropStage.classList.add('is-dragging');
      cropStage.setPointerCapture(event.pointerId);
    });

    cropStage.addEventListener('pointermove', (event) => {
      if (!state.dragging || event.pointerId !== state.dragPointerId) {
        return;
      }

      const deltaX = event.clientX - state.dragStartX;
      const deltaY = event.clientY - state.dragStartY;
      state.offsetX = state.dragOriginOffsetX + deltaX;
      state.offsetY = state.dragOriginOffsetY + deltaY;
      clampOffsets();
      renderCropImage();
    });

    cropStage.addEventListener('pointerup', (event) => {
      if (event.pointerId !== state.dragPointerId) {
        return;
      }

      finishDrag();
    });

    cropStage.addEventListener('pointercancel', finishDrag);
    cropStage.addEventListener('pointerleave', (event) => {
      if (!state.dragging || event.pointerId !== state.dragPointerId) {
        return;
      }
      finishDrag();
    });

    zoomInput.addEventListener('input', () => {
      updateScale(zoomInput.value);
    });

    cropImage.addEventListener('load', () => {
      state.imageLoaded = true;
      state.width = cropImage.naturalWidth || cropImage.width;
      state.height = cropImage.naturalHeight || cropImage.height;
      cropper.hidden = false;
      initializeCropper();
    });

    cropImage.addEventListener('error', () => {
      if (!state.sourceDataUrl) {
        clearCropper();
        return;
      }
      imageInput.value = '';
      clearCropper();
      renderAvatarError('Could not process avatar image. Please try another file.');
    });

    imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      if (!file) {
        clearCropper();
        renderAvatarError('');
        return;
      }

      const message = validateAvatarFile(file);
      if (message) {
        imageInput.value = '';
        clearCropper();
        renderAvatarError(message);
        return;
      }

      clearCropper();
      renderAvatarError('');

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) {
          imageInput.value = '';
          clearCropper();
          renderAvatarError('Could not process avatar image. Please try another file.');
          return;
        }

        state.sourceDataUrl = dataUrl;
        cropImage.src = dataUrl;
      };
      reader.onerror = () => {
        imageInput.value = '';
        clearCropper();
        renderAvatarError('Could not process avatar image. Please try another file.');
      };
      reader.readAsDataURL(file);
    });

    form.addEventListener('submit', (event) => {
      if (state.submitting) {
        event.preventDefault();
        return;
      }

      const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      const message = validateAvatarFile(file);
      if (message) {
        event.preventDefault();
        renderAvatarError(message);
        return;
      }

      if (!state.imageLoaded || !state.width || !state.height || !state.scale) {
        return;
      }

      event.preventDefault();
      state.submitting = true;
      renderAvatarError('');

      const stageSize = getStageSize();
      const outputMimeType = getAvatarOutputMimeType(file);
      const extension = extensionForMimeType(outputMimeType);
      const sourceX = (0 - state.offsetX) / state.scale;
      const sourceY = (0 - state.offsetY) / state.scale;
      const sourceSize = stageSize / state.scale;

      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_TARGET_SIZE;
      canvas.height = AVATAR_TARGET_SIZE;
      const context = canvas.getContext('2d');
      if (!context) {
        state.submitting = false;
        renderAvatarError('Could not process avatar image. Please try another file.');
        return;
      }

      context.drawImage(cropImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_TARGET_SIZE, AVATAR_TARGET_SIZE);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            state.submitting = false;
            renderAvatarError('Could not process avatar image. Please try another file.');
            return;
          }

          const croppedFile = new File([blob], `avatar-${Date.now()}.${extension}`, {
            type: outputMimeType,
            lastModified: Date.now()
          });
          const croppedMessage = validateAvatarFile(croppedFile);
          if (croppedMessage) {
            state.submitting = false;
            renderAvatarError(croppedMessage);
            return;
          }

          setSingleFileInput(imageInput, croppedFile);
          HTMLFormElement.prototype.submit.call(form);
        },
        outputMimeType,
        0.92
      );
    });

    form.addEventListener('reset', () => {
      clearCropper();
      renderAvatarError('');
    });

    window.addEventListener('resize', () => {
      if (!state.imageLoaded) {
        return;
      }

      updateScale(state.zoom);
    });

    clearCropper();
  });
})();

const REACTION_KINDS = ['like', 'love', 'haha', 'wow', 'sad'];
const REACTION_EMOJIS = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢' };

function initTweetExpansion(root) {
  (root || document).querySelectorAll('[data-expandable-content]').forEach((content) => {
    if (content.dataset.expandInit === '1') {
      return;
    }
    content.dataset.expandInit = '1';

    const card = content.closest('.tweet-card');
    const toggle = card ? card.querySelector('[data-expand-toggle]') : null;
    if (!toggle) {
      return;
    }

    content.classList.add('tweet-content-clamped');
    requestAnimationFrame(() => {
      const isOverflowing = content.scrollHeight > content.clientHeight + 2;
      toggle.hidden = !isOverflowing;
      if (!isOverflowing) {
        content.classList.remove('tweet-content-clamped');
      }
    });

    toggle.addEventListener('click', () => {
      const expanded = content.classList.toggle('tweet-content-clamped') === false;
      toggle.textContent = expanded ? 'Show less' : 'Show more';
      content.classList.toggle('tweet-content-expanded', expanded);
    });
  });
}

function initTextareaCounters(root) {
  (root || document).querySelectorAll('textarea').forEach((textarea) => {
    if (textarea.dataset.counterInit === '1') {
      return;
    }
    textarea.dataset.counterInit = '1';

    const form = textarea.closest('form');
    const counter = form ? form.querySelector('.char-counter') : null;
    if (!counter) {
      return;
    }

    const maxChars = Number(textarea.getAttribute('maxlength')) || 280;
    const updateCounter = () => {
      const remaining = maxChars - textarea.value.length;
      counter.textContent = String(remaining);
      counter.classList.toggle('danger', remaining < Math.min(20, Math.floor(maxChars * 0.1)));
    };

    updateCounter();
    textarea.addEventListener('input', updateCounter);
  });
}

function initInlineCommentValidation(root) {
  (root || document).querySelectorAll('[data-comment-form]').forEach((form) => {
    if (form.dataset.commentInit === '1') {
      return;
    }
    form.dataset.commentInit = '1';

    const input = form.querySelector('[data-comment-input]');
    const submitBtn = form.querySelector('[data-comment-submit]');
    const hint = form.querySelector('[data-comment-hint]');
    if (!input || !submitBtn) {
      return;
    }

    const refresh = () => {
      const hasText = input.value.trim().length > 0;
      submitBtn.disabled = !hasText;
      if (hint) {
        hint.textContent = hasText ? 'Ready to post.' : 'Write at least one character to comment.';
      }
    };

    refresh();
    input.addEventListener('input', refresh);
    form.addEventListener('submit', (event) => {
      if (!input.value.trim()) {
        event.preventDefault();
        refresh();
      }
    });
  });
}

function setReactionState(row, myReaction) {
  row.dataset.myReaction = myReaction || '';
  row.querySelectorAll('[data-reaction-btn]').forEach((button) => {
    const kind = button.getAttribute('data-kind') || '';
    button.classList.toggle('is-active', !!myReaction && kind === myReaction);
  });
}

function readReactionCounts(row) {
  const parseCount = (rawValue) => {
    const raw = String(rawValue || '').trim().toLowerCase();
    const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)([km]?)$/);
    if (!match) {
      return Number(raw.replace(/[^0-9]/g, '') || 0);
    }
    const base = Number(match[1]);
    if (!Number.isFinite(base)) {
      return 0;
    }
    if (match[2] === 'k') {
      return Math.round(base * 1000);
    }
    if (match[2] === 'm') {
      return Math.round(base * 1000000);
    }
    return Math.round(base);
  };

  const counts = {};
  REACTION_KINDS.forEach((kind) => {
    const el = row.querySelector(`[data-reaction-count="${kind}"]`);
    counts[kind] = parseCount(el ? el.textContent : '0');
  });
  return counts;
}

function renderReactionSummary(row, counts) {
  const container = row.querySelector('[data-reaction-summary]');
  if (!container) {
    return;
  }

  const top = REACTION_KINDS.map((kind) => ({ kind, count: Number(counts[kind] || 0) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  container.innerHTML = '';
  if (!top.length) {
    const empty = document.createElement('span');
    empty.className = 'muted reaction-empty';
    empty.textContent = 'No reactions yet';
    container.appendChild(empty);
    return;
  }

  top.forEach((entry) => {
    const chip = document.createElement('span');
    chip.className = 'reaction-chip';
    chip.textContent = `${REACTION_EMOJIS[entry.kind]} ${formatCompactCount(entry.count)}`;
    container.appendChild(chip);
  });
}

function closeAllReactionPopovers(exceptRow) {
  document.querySelectorAll('[data-reaction-row]').forEach((row) => {
    if (exceptRow && row === exceptRow) {
      return;
    }
    const popover = row.querySelector('[data-reaction-popover]');
    const toggle = row.querySelector('[data-reaction-toggle]');
    if (!popover || !toggle) {
      return;
    }
    popover.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  });
}

let openMoreMenuRoot = null;
let openMoreMenuButton = null;
let openMoreMenuPostId = '';

function closeMoreMenu(options = {}) {
  const returnFocus = Boolean(options.returnFocus);
  if (!openMoreMenuRoot) {
    return;
  }

  const menu = openMoreMenuRoot.querySelector('[data-more-menu]');
  if (menu) {
    menu.hidden = true;
  }
  if (openMoreMenuButton) {
    openMoreMenuButton.setAttribute('aria-expanded', 'false');
  }

  const focusTarget = returnFocus ? openMoreMenuButton : null;
  openMoreMenuRoot = null;
  openMoreMenuButton = null;
  openMoreMenuPostId = '';

  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus();
  }
}

function openMoreMenu(root, button) {
  if (!root || !button) {
    return;
  }
  const menu = root.querySelector('[data-more-menu]');
  if (!menu) {
    return;
  }

  if (openMoreMenuRoot && openMoreMenuRoot !== root) {
    closeMoreMenu({ returnFocus: false });
  }

  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  openMoreMenuRoot = root;
  openMoreMenuButton = button;
  const card = root.closest('.tweet-card');
  openMoreMenuPostId = card ? String(card.getAttribute('data-tweet-id') || '') : '';

  const firstItem = menu.querySelector('[role="menuitem"]');
  if (firstItem instanceof HTMLElement) {
    firstItem.focus();
  }
}

async function copyToClipboard(text) {
  if (!text) {
    return false;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

initTweetExpansion(document);
initTextareaCounters(document);
initInlineCommentValidation(document);

document.querySelectorAll('[data-reaction-row]').forEach((row) => {
  setReactionState(row, row.getAttribute('data-my-reaction') || '');
  renderReactionSummary(row, readReactionCounts(row));
});

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (openMoreMenuRoot && !target.closest('[data-more-menu-root]')) {
    closeMoreMenu({ returnFocus: false });
  }

  const likeBtn = target.closest('.like-btn');
  if (likeBtn) {
    const tweetId = likeBtn.dataset.tweetId;
    if (!tweetId || likeBtn.dataset.busy === '1') {
      return;
    }
    likeBtn.dataset.busy = '1';
    try {
      const response = await fetch(`/tweets/${tweetId}/like`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'x-csrf-token': csrfToken
        }
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      likeBtn.classList.toggle('liked', payload.liked);
      const likeCount = likeBtn.querySelector('.like-count');
      if (likeCount) {
        likeCount.textContent = formatCompactCount(payload.like_count);
      }
    } catch (err) {
      console.error(err);
    } finally {
      delete likeBtn.dataset.busy;
    }
    return;
  }

  const shareBtn = target.closest('[data-share-url]');
  if (shareBtn) {
    const relativeUrl = shareBtn.getAttribute('data-share-url') || '/';
    const absoluteUrl = new URL(relativeUrl, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ url: absoluteUrl });
      } else if (await copyToClipboard(absoluteUrl)) {
        const oldText = shareBtn.textContent;
        shareBtn.textContent = 'Copied';
        window.setTimeout(() => {
          shareBtn.textContent = oldText || 'Share';
        }, 1200);
      }
    } catch (err) {
      console.error(err);
    }
    return;
  }

  const reactionToggle = target.closest('[data-reaction-toggle]');
  if (reactionToggle) {
    const row = reactionToggle.closest('[data-reaction-row]');
    if (!row) {
      return;
    }
    const popover = row.querySelector('[data-reaction-popover]');
    if (!popover) {
      return;
    }
    const opening = popover.hidden;
    closeAllReactionPopovers(opening ? row : null);
    popover.hidden = !opening;
    reactionToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      const firstButton = popover.querySelector('[data-reaction-btn]');
      if (firstButton instanceof HTMLElement) {
        firstButton.focus();
      }
    }
    return;
  }

  const reactionBtn = target.closest('[data-reaction-btn]');
  if (reactionBtn) {
    const row = reactionBtn.closest('[data-reaction-row]');
    if (!row || row.getAttribute('data-can-react') !== '1') {
      return;
    }
    const tweetId = row.getAttribute('data-tweet-id');
    const kind = reactionBtn.getAttribute('data-kind');
    if (!tweetId || !kind || row.getAttribute('data-reaction-busy') === '1') {
      return;
    }
    row.setAttribute('data-reaction-busy', '1');
    try {
      const response = await fetch(`/tweets/${tweetId}/reaction`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'x-csrf-token': csrfToken
        },
        body: new URLSearchParams({ kind }).toString()
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      if (!payload || !payload.ok || !payload.counts) {
        return;
      }
      REACTION_KINDS.forEach((reactionKind) => {
        const countEl = row.querySelector(`[data-reaction-count="${reactionKind}"]`);
        if (!countEl) {
          return;
        }
        countEl.textContent = formatCompactCount(Number(payload.counts[reactionKind] || 0));
      });
      setReactionState(row, payload.my_reaction || '');
      renderReactionSummary(row, payload.counts);
    } catch (err) {
      console.error(err);
    } finally {
      row.removeAttribute('data-reaction-busy');
    }
    return;
  }

  const moreMenuBtn = target.closest('[data-more-menu-button]');
  if (moreMenuBtn) {
    const root = moreMenuBtn.closest('[data-more-menu-root]');
    if (!root) {
      return;
    }
    if (openMoreMenuRoot === root && openMoreMenuPostId === String(root.closest('.tweet-card')?.getAttribute('data-tweet-id') || '')) {
      closeMoreMenu({ returnFocus: false });
    } else {
      openMoreMenu(root, moreMenuBtn);
    }
    return;
  }

  const copyMenuBtn = target.closest('[data-copy-url]');
  if (copyMenuBtn) {
    const relativeUrl = copyMenuBtn.getAttribute('data-copy-url') || '/';
    const absoluteUrl = new URL(relativeUrl, window.location.origin).toString();
    try {
      if (await copyToClipboard(absoluteUrl)) {
        const oldText = copyMenuBtn.textContent;
        copyMenuBtn.textContent = 'Copied';
        window.setTimeout(() => {
          copyMenuBtn.textContent = oldText || 'Copy link';
        }, 1200);
      }
    } catch (err) {
      console.error(err);
    }
    closeMoreMenu({ returnFocus: true });
    return;
  }

  if (!target.closest('[data-reaction-row]')) {
    closeAllReactionPopovers(null);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeAllReactionPopovers(null);
    closeMoreMenu({ returnFocus: true });
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.matches('[data-reaction-btn]')) {
    const popover = target.closest('[data-reaction-popover]');
    if (!popover) {
      return;
    }
    const items = Array.from(popover.querySelectorAll('[data-reaction-btn]')).filter((item) => !item.disabled);
    const index = items.indexOf(target);
    if (index < 0) {
      return;
    }
    const cols = 3;
    let nextIndex = index;
    if (event.key === 'ArrowRight') {
      nextIndex = Math.min(items.length - 1, index + 1);
    } else if (event.key === 'ArrowLeft') {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === 'ArrowDown') {
      nextIndex = Math.min(items.length - 1, index + cols);
    } else if (event.key === 'ArrowUp') {
      nextIndex = Math.max(0, index - cols);
    }
    if (nextIndex !== index) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  }

  if (target.matches('[data-more-menu-button]') && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    target.click();
  }

  const menu = target.closest('[data-more-menu]');
  if (menu && target.getAttribute('role') === 'menuitem') {
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).filter((item) => item instanceof HTMLElement);
    const index = items.indexOf(target);
    if (index < 0) {
      return;
    }
    let nextIndex = index;
    if (event.key === 'ArrowDown') {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else if (event.key === 'Tab') {
      closeMoreMenu({ returnFocus: false });
      return;
    }
    if (nextIndex !== index) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  }
});

window.addEventListener(
  'scroll',
  () => {
    if (openMoreMenuRoot) {
      closeMoreMenu({ returnFocus: false });
    }
  },
  { passive: true }
);

(function initInfiniteFeedAndSkeletons() {
  const feedSurface = document.querySelector('[data-feed-surface]');
  const loadWrap = document.querySelector('[data-load-more-wrap]');
  if (!feedSurface || !loadWrap) {
    return;
  }
  let loadLink = loadWrap.querySelector('.load-more-link');
  if (!loadLink) {
    return;
  }

  let isLoading = false;
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.height = '1px';
  sentinel.style.width = '100%';
  loadWrap.before(sentinel);

  function createSkeleton() {
    const shell = document.createElement('div');
    shell.className = 'feed-skeleton-list';
    for (let i = 0; i < 3; i += 1) {
      const row = document.createElement('div');
      row.className = 'feed-skeleton-row';
      row.innerHTML = '<div class="feed-skeleton-line is-short"></div><div class="feed-skeleton-line"></div><div class="feed-skeleton-line is-mid"></div>';
      shell.appendChild(row);
    }
    return shell;
  }

  async function loadNextPage() {
    if (isLoading || !loadLink) {
      return;
    }
    isLoading = true;
    const skeleton = createSkeleton();
    feedSurface.appendChild(skeleton);
    try {
      const response = await fetch(loadLink.href, { headers: { Accept: 'text/html' } });
      if (!response.ok) {
        return;
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const nextCards = Array.from(doc.querySelectorAll('[data-feed-surface] .tweet-card'));
      const fragment = document.createDocumentFragment();
      nextCards.forEach((card) => fragment.appendChild(card));
      feedSurface.appendChild(fragment);

      initTweetExpansion(feedSurface);
      initTextareaCounters(feedSurface);
      initInlineCommentValidation(feedSurface);
      feedSurface.querySelectorAll('[data-reaction-row]').forEach((row) => {
        setReactionState(row, row.getAttribute('data-my-reaction') || '');
        renderReactionSummary(row, readReactionCounts(row));
      });

      const nextLink = doc.querySelector('.load-more-link');
      if (nextLink) {
        loadLink.href = nextLink.getAttribute('href') || loadLink.href;
      } else {
        loadWrap.remove();
        observer.disconnect();
      }
    } catch (_err) {
      // Keep fallback link for manual retry.
    } finally {
      skeleton.remove();
      isLoading = false;
    }
  }

  loadWrap.addEventListener('click', (event) => {
    const anchor = event.target.closest('.load-more-link');
    if (!anchor) {
      return;
    }
    event.preventDefault();
    loadNextPage();
  });

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        loadNextPage();
      }
    },
    { rootMargin: '500px 0px 500px 0px' }
  );
  observer.observe(sentinel);
})();

(function initBackToTop() {
  const button = document.querySelector('[data-back-to-top]');
  if (!button) {
    return;
  }

  const refreshVisibility = () => {
    button.hidden = window.scrollY < 700;
  };

  refreshVisibility();
  window.addEventListener('scroll', refreshVisibility, { passive: true });
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
