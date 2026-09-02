import { test, expect } from '@playwright/test';

test.describe('Drive Merge E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the accounts API
    await page.route('**/api/drive/accounts', async (route) => {
      await route.fulfill({ json: [ { email: 'mock1@gmail.com' }, { email: 'mock2@gmail.com' } ] });
    });

    // Mock the quota API
    await page.route('**/api/drive/quota', async (route) => {
      const json = {
        totalUsage: 9800000000,
        totalLimit: 10000000000000,
        accounts: [
          { email: 'mock1@gmail.com', usage: 1000, limit: 10000 },
          { email: 'mock2@gmail.com', usage: 2000, limit: 20000 }
        ]
      };
      await route.fulfill({ json });
    });

    // Mock the files API
    await page.route('**/api/drive/files', async (route) => {
      const json = {
        files: [
          { id: '1', name: 'Mock Document.pdf', mimeType: 'application/pdf', size: '1024', accountEmail: 'mock1@gmail.com' },
          { id: '2', name: 'Mock Image.png', mimeType: 'image/png', size: '2048', accountEmail: 'mock2@gmail.com', hasThumbnail: true, thumbnailLink: 'https://via.placeholder.com/150' },
        ]
      };
      await route.fulfill({ json });
    });
  });

  test('should render the landing page when not logged in', async ({ page }) => {
    // Override quota to return empty accounts
    await page.route('**/api/drive/quota', async (route) => {
      await route.fulfill({ json: { totalUsage: 0, totalLimit: 0, accounts: [] } });
    });
    
    await page.route('**/api/drive/accounts', async (route) => {
      await route.fulfill({ json: [] });
    });
    
    await page.goto('/');
    
    await expect(page.locator('h2', { hasText: 'A place for all of your files' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Connect Google Drive' })).toBeVisible();
  });

  test('should render dashboard and files when logged in', async ({ page }) => {
    await page.goto('/');
    
    // Check Storage Summary
    await expect(page.locator('.storage-title', { hasText: 'Storage Summary' })).toBeVisible();
    await expect(page.locator('text=9.13 GB used')).toBeVisible(); // 9.8 GB formatting varies slightly by base 10/2, 9800000000 bytes = 9.13 GiB
    
    // Check Files Grid
    await expect(page.locator('h2', { hasText: 'My Drive' })).toBeVisible();
    await expect(page.locator('.file-card').filter({ hasText: 'Mock Document.pdf' })).toBeVisible();
    await expect(page.locator('.file-card').filter({ hasText: 'Mock Image.png' })).toBeVisible();
  });

  test('should open preview modal on file click', async ({ page }) => {
    await page.goto('/');
    
    await page.locator('.file-card').filter({ hasText: 'Mock Document.pdf' }).click();
    
    // Preview modal should appear
    const modal = page.locator('.modal-preview-content');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toContainText('Mock Document.pdf');
    
    // Since it's a PDF, there should be an iframe
    await expect(modal.locator('iframe')).toBeVisible();
    
    // Close modal
    await modal.locator('.modal-close').click();
    await expect(modal).not.toBeVisible();
  });

  test('should navigate to settings and toggle theme', async ({ page }) => {
    await page.goto('/');
    
    // Click Settings on sidebar
    await page.locator('.nav-item').filter({ hasText: 'Settings' }).click();
    
    await expect(page.locator('h2.page-title', { hasText: 'Settings' })).toBeVisible();
    
    // Select dark theme
    await page.locator('select.settings-select').selectOption('dark');
    
    // Check if dark theme is applied to html element
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
