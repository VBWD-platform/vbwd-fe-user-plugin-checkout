import { test, expect } from '@playwright/test';

/**
 * S53.1 — the bot checkout-draft hand-off.
 *
 * A bot user receives `/checkout?draft=<token>`. Visiting it resolves the draft
 * via the public endpoint, seeds the fe-core cart, and renders the EXISTING
 * checkout summary with the draft's line items. The endpoint is mocked here so
 * the spec is deterministic and needs no bot-minted token; the contract under
 * test is the fe-user hydration, not the backend (covered by S53.0 integration).
 */
const DRAFT_TOKEN = 'e2e-draft-token';
const DRAFT_ENDPOINT = `**/api/v1/subscription/public/checkout-draft/${DRAFT_TOKEN}`;

test.describe('Bot checkout-draft hydration', () => {
  test('a resolvable ?draft renders the existing checkout summary with the draft items', async ({ page }) => {
    await page.route(DRAFT_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          line_items: [
            {
              item_type: 'SUBSCRIPTION',
              item_id: '11111111-1111-1111-1111-111111111111',
              quantity: 1,
              name: 'Pro Plan',
              unit_price: '19.00',
              currency: 'USD',
            },
          ],
        }),
      });
    });

    await page.goto(`/checkout?draft=${DRAFT_TOKEN}`);

    await expect(page.locator('[data-testid="order-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="plan-name"]')).toContainText('Pro Plan');
    await expect(page.locator('[data-testid="checkout-draft-expired"]')).toHaveCount(0);
  });

  test('an expired / already-redeemed ?draft (404) shows the expired-link state', async ({ page }) => {
    await page.route(DRAFT_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Checkout draft not found or expired' }),
      });
    });

    await page.goto(`/checkout?draft=${DRAFT_TOKEN}`);

    await expect(page.locator('[data-testid="checkout-draft-expired"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-summary"]')).toHaveCount(0);
  });
});
