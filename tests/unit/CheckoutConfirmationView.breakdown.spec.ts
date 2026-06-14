/**
 * S85.4 phase-2 — CheckoutConfirmationView renders a totals-level
 * <PriceBreakdown> built straight from the persisted invoice net / tax / gross
 * fields. The FE does no tax math: a tampered tax_amount is shown verbatim.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { invoice_id: 'inv-1' } }),
}));

vi.mock('@/api', () => ({
  api: { get: vi.fn() },
}));

vi.mock('@/registries/checkoutConfirmationRegistry', () => ({
  checkoutConfirmationRegistry: { plugins: { value: [] } },
}));

vi.mock('../../cms/src/stores/useCmsStore', () => ({
  useCmsStore: () => ({ currentPage: null }),
}));

import CheckoutConfirmationView from '../../CheckoutConfirmationView.vue';
import { api } from '@/api';

const mockGet = vi.mocked(api.get);

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  missing: (_locale, key) => key,
  messages: {
    en: {
      price: { net: 'Net', gross: 'Gross', taxLine: '{name} {rate}%' },
    },
  },
});

function mountView() {
  setActivePinia(createPinia());
  return mount(CheckoutConfirmationView, {
    global: {
      plugins: [i18n],
      mocks: { $t: (key: string) => key },
    },
  });
}

describe('CheckoutConfirmationView — totals breakdown (S85.4)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('renders net / per-rate tax / gross from persisted invoice fields', async () => {
    mockGet.mockResolvedValue({
      invoice_number: 'INV-001',
      status: 'paid',
      amount: '119.00',
      subtotal: '100.00',
      tax_amount: '19.00',
      total_amount: '119.00',
      currency: 'EUR',
      line_items: [],
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="confirmation-breakdown"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="price-breakdown-net"]').text()).toContain('100');
    expect(wrapper.get('[data-testid="price-breakdown-tax-line"]').text()).toContain('19');
    expect(wrapper.get('[data-testid="price-breakdown-gross"]').text()).toContain('119');
    // No redundant aggregate Σtax row (Net + per-rate + Gross only).
    expect(wrapper.find('[data-testid="price-breakdown-tax-total"]').exists()).toBe(false);
  });

  it('shows a tampered tax_amount verbatim (no recompute)', async () => {
    mockGet.mockResolvedValue({
      invoice_number: 'INV-001',
      status: 'paid',
      amount: '119.00',
      subtotal: '100.00',
      tax_amount: '5.00',
      total_amount: '119.00',
      currency: 'EUR',
      line_items: [],
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="price-breakdown-tax-line"]').text()).toContain('5');
    expect(wrapper.get('[data-testid="price-breakdown-gross"]').text()).toContain('119');
  });
});
