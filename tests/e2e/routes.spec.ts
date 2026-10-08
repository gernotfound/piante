import { expect, test } from '@playwright/test';

test('home: mostra la shell pubblica M0', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ogni pianta ha/ })).toBeVisible();
  await expect(page.getByText('Nessuna connessione ai dati reali')).toBeVisible();
});

test('area personale: non offre dati né salvataggi', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Il tuo spazio botanico.' })).toBeVisible();
  await expect(page.getByText(/non permette accessi, modifiche o salvataggi/)).toBeVisible();
});

test('vetrine: deep link e scheda pubblica sono segnaposto', async ({ page }) => {
  await page.goto('/gernotfound/public');
  await expect(page.getByRole('heading', { name: 'gernotfound' })).toBeVisible();
  await page.goto('/gernotfound/public/avocado-bacon');
  await expect(page.getByRole('heading', { name: 'avocado bacon' })).toBeVisible();
});

test('non pubblica contenuti per rotte non valide', async ({ page }) => {
  await page.goto('/admin/public');
  await expect(page.getByRole('heading', { name: 'Questa pagina non esiste.' })).toBeVisible();
});
