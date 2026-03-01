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
  await page.getByRole('button', { name: 'Logout' }).click();
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
