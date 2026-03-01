const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
const themeToggle = document.getElementById('theme-toggle');
const THEME_STORAGE_KEY = 'loopfeed-theme';
const rootElement = document.documentElement;

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
  if (!themeToggle) {
    return;
  }

  const effectiveTheme = getEffectiveTheme();
  const nextTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
  themeToggle.textContent = `Switch to ${nextTheme}`;
  themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
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

if (themeToggle) {
  applyStoredTheme();

  themeToggle.addEventListener('click', () => {
    const nextTheme = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    rootElement.setAttribute('data-theme', nextTheme);
    writeThemePreference(nextTheme);
    updateThemeToggleLabel();
  });
}

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

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
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

document.querySelectorAll('.tweet-textarea').forEach((textarea) => {
  const form = textarea.closest('form');
  const counter = form ? form.querySelector('.char-counter') : null;
  if (!counter) {
    return;
  }

  const updateCounter = function updateCounter() {
    const remaining = 280 - textarea.value.length;
    counter.textContent = remaining;
    counter.classList.toggle('danger', remaining < 20);
  };

  updateCounter();
  textarea.addEventListener('input', updateCounter);
});

document.querySelectorAll('.like-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const tweetId = btn.dataset.tweetId;

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
      btn.classList.toggle('liked', payload.liked);

      const likeCount = btn.querySelector('.like-count');
      if (likeCount) {
        likeCount.textContent = payload.like_count;
      }
    } catch (err) {
      console.error(err);
    }
  });
});
