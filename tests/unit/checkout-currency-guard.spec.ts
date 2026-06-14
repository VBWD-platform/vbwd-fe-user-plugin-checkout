/**
 * S93 Slice A guard — the checkout surfaces must use the global operating
 * currency (the `default_currency` core setting, surfaced via the app-config
 * store), never a hardcoded `'USD'` and never the dropped `resource.currency`
 * field (S85.1 removed it from `booking_resource`, so it renders `undefined`).
 *
 * If this fails, a checkout view re-introduced a currency leak — route it
 * through `useAppConfigStore().defaultCurrency` (or the checkout store's
 * `currency` getter, which already does) instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const CHECKOUT_VIEWS = [
  'plugins/checkout/PublicCheckoutView.vue',
  'plugins/booking/booking/views/BookingCheckout.vue',
];

describe('checkout views use the global operating currency (S93)', () => {
  it.each(CHECKOUT_VIEWS)('%s does not hardcode \'USD\'', (rel) => {
    const code = read(rel);
    // Strip line comments so an explanatory comment mentioning 'USD' is allowed.
    const withoutComments = code
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(withoutComments).not.toMatch(/['"]USD['"]/);
  });

  it.each(CHECKOUT_VIEWS)('%s does not read the dropped resource.currency', (rel) => {
    const code = read(rel);
    const withoutComments = code
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(withoutComments).not.toContain('resource.currency');
  });

  it('checkout views reference the app-config default currency', () => {
    for (const rel of CHECKOUT_VIEWS) {
      const code = read(rel);
      expect(
        code.includes('useAppConfigStore') || code.includes('checkoutStore.currency'),
      ).toBe(true);
    }
  });
});
