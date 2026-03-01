const { test, expect } = require('@playwright/test');

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

async function createTweet(page, content) {
  await page.goto('/');
  await page.getByLabel('What is happening?').fill(content);
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText(content)).toBeVisible();
}

test('followed-post notifications respect notify toggle', async ({ browser }) => {
  const poster = buildUser('poster');
  const follower = buildUser('follower');

  const posterContext = await browser.newContext();
  const posterPage = await posterContext.newPage();
  await register(posterPage, poster);

  const followerContext = await browser.newContext();
  const followerPage = await followerContext.newPage();
  await register(followerPage, follower);

  await followerPage.goto(`/users/${poster.username}`);
  await followerPage.getByRole('button', { name: 'Follow' }).click();
  await expect(followerPage.getByRole('button', { name: 'Unfollow' })).toBeVisible();

  await expect(followerPage.getByRole('button', { name: 'Notify Posts: Off' })).toBeVisible();
  await followerPage.getByRole('button', { name: 'Notify Posts: Off' }).click();
  await expect(followerPage.getByRole('button', { name: 'Notify Posts: On' })).toBeVisible();

  const firstTweet = `notify-on-${uniqueSuffix()}`;
  await createTweet(posterPage, firstTweet);

  await followerPage.goto('/notifications');
  await expect(followerPage.getByText('posted a new tweet.')).toBeVisible();
  await expect(followerPage.getByRole('link', { name: new RegExp(`@${poster.username}`) })).toBeVisible();

  await followerPage.getByRole('button', { name: 'Mark all read' }).click();
  await expect(followerPage.locator('.notif-badge')).toHaveCount(0);

  await followerPage.goto(`/users/${poster.username}`);
  await followerPage.getByRole('button', { name: 'Notify Posts: On' }).click();
  await expect(followerPage.getByRole('button', { name: 'Notify Posts: Off' })).toBeVisible();

  const secondTweet = `notify-off-${uniqueSuffix()}`;
  await createTweet(posterPage, secondTweet);

  await followerPage.goto('/');
  await expect(followerPage.locator('.notif-badge')).toHaveCount(0);
  await followerPage.goto('/notifications');
  await expect(followerPage.locator('.notification-item', { hasText: 'posted a new tweet.' })).toHaveCount(1);

  await followerContext.close();
  await posterContext.close();
});

test('reply notifications appear for tweet owner', async ({ browser }) => {
  const owner = buildUser('owner');
  const replier = buildUser('replier');

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await register(ownerPage, owner);
  const ownerTweet = `owner-post-${uniqueSuffix()}`;
  await createTweet(ownerPage, ownerTweet);

  const replierContext = await browser.newContext();
  const replierPage = await replierContext.newPage();
  await register(replierPage, replier);

  await replierPage.goto('/explore');
  const ownerCard = replierPage.locator('.tweet-card', { hasText: ownerTweet }).first();
  await ownerCard.getByRole('link', { name: 'Reply', exact: true }).click();
  await replierPage.locator('#reply-content').fill(`reply-${uniqueSuffix()}`);
  await replierPage.getByRole('button', { name: 'Reply' }).click();

  await ownerPage.goto('/notifications');
  await expect(ownerPage.getByText('replied to your tweet.')).toBeVisible();
  await expect(ownerPage.getByRole('link', { name: new RegExp(`@${replier.username}`) })).toBeVisible();

  await replierContext.close();
  await ownerContext.close();
});
