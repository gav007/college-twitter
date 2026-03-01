const { test, expect } = require('@playwright/test');

test('theme toggle persists after refresh', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');

  const themeToggle = page.getByRole('button', { name: /switch to dark/i });
  await expect(themeToggle).toBeVisible();

  await themeToggle.click();
  await expect(page.locator(':root')).toHaveAttribute('data-theme', 'dark');

  const storedTheme = await page.evaluate(() => localStorage.getItem('loopfeed-theme'));
  expect(storedTheme).toBe('dark');

  await page.reload();
  await expect(page.locator(':root')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /switch to light/i })).toBeVisible();
});
