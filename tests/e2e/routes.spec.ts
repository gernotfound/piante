import { expect, test } from '@playwright/test';

test('home: mostra la shell pubblica M0', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ogni pianta ha/ })).toBeVisible();
  await expect(page.getByText('Versione sperimentale · Nessun dato pubblicato')).toBeVisible();
});

test('area personale: non offre dati né salvataggi', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Il tuo spazio botanico.' })).toBeVisible();
  await expect(page.getByText(/modalità sperimentale consente solo agli account autorizzati/)).toBeVisible();
  await expect(page.getByRole('form',{name:'Aggiungi pianta'})).toHaveCount(0);
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

test('release boundary: public shell never starts test Auth or contacts Firebase', async ({ page }) => {
  const firebaseRequests: string[] = [];
  const firebaseHosts = new Set([
    'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
    'firestore.googleapis.com', 'firebaseinstallations.googleapis.com'
  ]);
  page.on('request', request => {
    if (firebaseHosts.has(new URL(request.url()).hostname)) {
      firebaseRequests.push(request.url());
    }
  });
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', { name: 'Accesso sperimentale' })).toHaveCount(0);
  expect(firebaseRequests).toEqual([]);
});
