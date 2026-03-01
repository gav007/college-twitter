const { test, expect } = require('@playwright/test');

function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

function buildUser(prefix) {
  const suffix = uniqueSuffix();
  const username = `${prefix}${suffix}`.slice(0, 20);
  return {
    username,
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

async function login(page, user) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
}

async function logout(page) {
  const logoutButton = page.getByRole('button', { name: 'Logout' });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: /Open menu|Close menu/ }).click();
  }
  await logoutButton.click();
  await expect(page).toHaveURL('/login');
}

async function createTweet(page, content) {
  await page.goto('/');
  await page.getByLabel('What is happening?').fill(content);
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText(content)).toBeVisible();
}

test('register -> login -> create tweet', async ({ page }) => {
  const user = buildUser('coreuser');
  const tweetContent = `core-flow-tweet-${uniqueSuffix()}`;

  await register(page, user);
  await logout(page);
  await login(page, user);
  await createTweet(page, tweetContent);
});

test('profile settings can update username and bio', async ({ page }) => {
  const user = buildUser('profileuser');
  const nextUsername = `renamed${uniqueSuffix()}`.slice(0, 20);
  const nextDisplayName = `Renamed ${uniqueSuffix()}`;
  const nextBio = `Bio updated ${uniqueSuffix()}`;
  const avatarUrl = `https://example.com/avatar-${uniqueSuffix()}.png`;

  await register(page, user);
  await page.goto(`/users/${user.username}`);

  await page.locator('#profile-username').fill(nextUsername);
  await page.locator('#profile-display-name').fill(nextDisplayName);
  await page.locator('#profile-bio').fill(nextBio);
  await page.locator('#profile-avatar-url').fill(avatarUrl);
  await page.getByRole('button', { name: 'Save Profile' }).click();

  await expect(page).toHaveURL(new RegExp(`/users/${nextUsername}\\?updated=1$`));
  await expect(page.getByText('Profile updated.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: nextDisplayName })).toBeVisible();
  await expect(page.getByText(`@${nextUsername}`)).toBeVisible();
  await expect(page.locator('.profile-bio')).toHaveText(nextBio);
  await expect(page.locator('.profile-avatar-image')).toHaveAttribute('src', avatarUrl);
  await expect(page.locator('.nav-avatar-image')).toHaveAttribute('src', avatarUrl);
});

test('global compose button opens modal and can post', async ({ page }) => {
  const user = buildUser('modaluser');
  const content = `modal-post-${uniqueSuffix()}`;

  await register(page, user);
  await page.getByRole('button', { name: 'Compose' }).click();

  const modal = page.locator('#global-compose-modal');
  await expect(modal).toBeVisible();

  await modal.locator('textarea[name="content"]').fill(content);
  await modal.getByRole('button', { name: 'Post' }).click();

  await expect(page.getByText(content)).toBeVisible();
});

test('profile shows streak and unlocks post/reply achievements', async ({ page }) => {
  const user = buildUser('hookuser');
  const tweetContent = `hook-post-${uniqueSuffix()}`;
  const replyContent = `hook-reply-${uniqueSuffix()}`;

  await register(page, user);
  await createTweet(page, tweetContent);

  await page.goto(`/users/${user.username}`);
  await expect(page.locator('.achievement-title', { hasText: 'First Post' })).toBeVisible();
  await expect(page.locator('.progress-chip').first()).toContainText('day streak');

  const postCard = page.locator('.tweet-card', { hasText: tweetContent }).first();
  await postCard.getByRole('link', { name: 'Reply', exact: true }).click();
  await page.locator('#reply-content').fill(replyContent);
  await page.getByRole('button', { name: 'Reply' }).click();

  await page.goto(`/users/${user.username}`);
  await expect(page.locator('.achievement-title', { hasText: 'First Reply' })).toBeVisible();
});

test('profile settings reject duplicate username', async ({ page }) => {
  const existingUser = buildUser('existing');
  const editingUser = buildUser('editing');

  await register(page, existingUser);
  await logout(page);
  await register(page, editingUser);

  await page.goto(`/users/${editingUser.username}`);
  await page.locator('#profile-username').fill(existingUser.username);
  await page.getByRole('button', { name: 'Save Profile' }).click();

  await expect(page).toHaveURL(new RegExp(`/users/${editingUser.username}\\?error=`));
  await expect(page.getByText('Username is already taken.')).toBeVisible();
});

test('thread reply flow increments reply count', async ({ page }) => {
  const user = buildUser('replyuser');
  const parentContent = `thread-parent-${uniqueSuffix()}`;
  const replyContent = `thread-reply-${uniqueSuffix()}`;

  await register(page, user);
  await createTweet(page, parentContent);

  const parentCard = page.locator('.tweet-card', { hasText: parentContent }).first();
  await expect(parentCard.getByText('Replies 0')).toBeVisible();
  await parentCard.getByRole('link', { name: 'Reply', exact: true }).click();

  await expect(page).toHaveURL(/\/tweets\/\d+$/);
  await page.locator('#reply-content').fill(replyContent);
  await page.getByRole('button', { name: 'Reply' }).click();

  await expect(page).toHaveURL(/\/tweets\/\d+$/);
  await expect(page.getByText(replyContent)).toBeVisible();
  await expect(page.locator('.tweet-card', { hasText: parentContent }).getByText('Replies 1')).toBeVisible();
});

test('follow user then verify feed and explore regression', async ({ browser }) => {
  const bob = buildUser('bob');
  const alice = buildUser('alice');
  const bobTweet = `follow-flow-tweet-${uniqueSuffix()}`;

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await register(bobPage, bob);
  await createTweet(bobPage, bobTweet);

  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await register(alicePage, alice);

  await alicePage.goto(`/users/${bob.username}`);
  await alicePage.getByRole('button', { name: 'Follow' }).click();
  await expect(alicePage.getByRole('button', { name: 'Unfollow' })).toBeVisible();

  await alicePage.goto('/');
  await expect(alicePage.getByText(bobTweet)).toBeVisible();

  await alicePage.goto('/explore');
  await expect(alicePage.getByText(bobTweet)).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});
