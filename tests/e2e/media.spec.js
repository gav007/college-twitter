const { test, expect } = require('@playwright/test');

const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7YF8sAAAAASUVORK5CYII=',
  'base64'
);

function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

function buildUser(prefix) {
  const suffix = uniqueSuffix();
  return {
    username: `${prefix}${suffix}`.slice(0, 20),
    displayName: `${prefix} ${suffix}`,
    password: `Pass_${suffix}!`
  };
}

async function register(page, user) {
  await page.goto('/register');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display Name').fill(user.displayName);
  await page.locator('#password').fill(user.password);
  await page.locator('#password_confirm').fill(user.password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL('/');
}

async function getTweetFormCsrf(page) {
  return page.locator('form[action="/tweets"] input[name="_csrf"]').inputValue();
}

async function getAvatarFormCsrf(page) {
  return page.locator('form[action="/settings/avatar"] input[name="_csrf"]').inputValue();
}

test('valid image upload succeeds and renders in tweet card', async ({ page }) => {
  const user = buildUser('mediauser');
  const content = `media-valid-${uniqueSuffix()}`;

  await register(page, user);
  await page.getByLabel('What is happening?').fill(content);
  await page.locator('#tweet-image').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: TINY_PNG_BUFFER
  });
  await page.locator('form[action="/tweets"] button[type="submit"]').first().click();

  const tweetCard = page.locator('.tweet-card', { hasText: content }).first();
  await expect(tweetCard).toBeVisible();
  const image = tweetCard.locator('img.tweet-image');
  await expect(image).toBeVisible();

  const src = await image.getAttribute('src');
  expect(src).toMatch(/^\/media\/\d+$/);

  const mediaResponse = await page.request.get(src);
  expect(mediaResponse.status()).toBe(200);
  expect(mediaResponse.headers()['content-type']).toContain('image/png');
});

test('invalid upload type is rejected', async ({ page }) => {
  const user = buildUser('mediatype');
  await register(page, user);

  const csrfToken = await getTweetFormCsrf(page);
  const response = await page.request.post('/tweets', {
    failOnStatusCode: false,
    multipart: {
      _csrf: csrfToken,
      content: `invalid-type-${uniqueSuffix()}`,
      image: {
        name: 'not-image.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image', 'utf8')
      }
    }
  });

  expect(response.status()).toBe(400);
  expect(await response.text()).toContain('Only JPG, JPEG, PNG, and WebP images are allowed.');
});

test('oversized upload is rejected', async ({ page }) => {
  const user = buildUser('mediasize');
  await register(page, user);

  const csrfToken = await getTweetFormCsrf(page);
  const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
  const response = await page.request.post('/tweets', {
    failOnStatusCode: false,
    multipart: {
      _csrf: csrfToken,
      content: `oversize-${uniqueSuffix()}`,
      image: {
        name: 'huge.jpg',
        mimeType: 'image/jpeg',
        buffer: oversizedBuffer
      }
    }
  });

  expect(response.status()).toBe(413);
  expect(await response.text()).toContain('Image must be 5 MB or smaller.');
});

test('upload post without CSRF token is blocked', async ({ page }) => {
  const user = buildUser('mediacsrf');
  await register(page, user);

  const response = await page.request.post('/tweets', {
    failOnStatusCode: false,
    multipart: {
      content: `no-csrf-${uniqueSuffix()}`,
      image: {
        name: 'tiny.png',
        mimeType: 'image/png',
        buffer: TINY_PNG_BUFFER
      }
    }
  });

  expect(response.status()).toBe(403);
  expect(await response.text()).toContain('Invalid CSRF token');
});

test('upload spam hits rate limit', async ({ page }) => {
  const user = buildUser('mediarate');
  await register(page, user);

  const csrfToken = await getTweetFormCsrf(page);
  let first429Attempt = 0;

  for (let attempt = 1; attempt <= 35; attempt += 1) {
    const response = await page.request.post('/tweets', {
      failOnStatusCode: false,
      multipart: {
        _csrf: csrfToken,
        content: `spam-${attempt}-${uniqueSuffix()}`,
        image: {
          name: `tiny-${attempt}.png`,
          mimeType: 'image/png',
          buffer: TINY_PNG_BUFFER
        }
      }
    });

    if (response.status() === 429) {
      first429Attempt = attempt;
      break;
    }
  }

  expect(first429Attempt).toBeGreaterThan(0);
});

test('avatar upload succeeds and serves image', async ({ page }) => {
  const user = buildUser('avatarok');
  await register(page, user);
  await page.goto(`/users/${user.username}`);

  await page.locator('#profile-avatar-image').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: TINY_PNG_BUFFER
  });
  await page.getByRole('button', { name: 'Upload Avatar' }).click();

  await expect(page).toHaveURL(new RegExp(`/users/${user.username}\\?updated=1$`));
  const profileImage = page.locator('.profile-avatar-image');
  await expect(profileImage).toBeVisible();
  const src = await profileImage.getAttribute('src');
  expect(src).toMatch(/^\/avatars\/.+\.(jpg|jpeg|png|webp)$/);

  const mediaResponse = await page.request.get(src);
  expect(mediaResponse.status()).toBe(200);
  expect(mediaResponse.headers()['content-type']).toContain('image/');
});

test('oversized avatar upload is rejected', async ({ page }) => {
  const user = buildUser('avatarbig');
  await register(page, user);
  await page.goto(`/users/${user.username}`);

  const csrfToken = await getAvatarFormCsrf(page);
  const oversizedBuffer = Buffer.alloc(1024 * 1024 + 1, 1);
  const response = await page.request.post('/settings/avatar', {
    failOnStatusCode: false,
    multipart: {
      _csrf: csrfToken,
      avatar_image: {
        name: 'huge-avatar.jpg',
        mimeType: 'image/jpeg',
        buffer: oversizedBuffer
      }
    }
  });

  expect(response.status()).toBe(413);
  expect(await response.text()).toContain('Avatar image must be 1 MB or smaller.');
});
