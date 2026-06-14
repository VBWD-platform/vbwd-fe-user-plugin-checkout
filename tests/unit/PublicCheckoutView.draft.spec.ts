/**
 * S53.1 — `PublicCheckoutView` accepts `?draft=<token>`.
 *
 * With a `?draft` token the view hydrates the fe-core cart from the bot
 * checkout-draft (S53.0) and then drives the EXISTING cart-backed subscription
 * checkout source — no new checkout logic. Without `?draft` it behaves exactly
 * as today (regression). A 404 (expired / already-redeemed) shows a friendly
 * expired-link state and does not throw.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PublicCheckoutView from '../../PublicCheckoutView.vue';
import { hydrateCartFromDraft, DraftExpiredError } from '../../draftCheckout';
import { useCheckoutStore } from '@/stores/checkout';

const routeQuery: Record<string, string> = {};

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../draftCheckout', () => ({
  hydrateCartFromDraft: vi.fn().mockResolvedValue(undefined),
  DraftExpiredError: class DraftExpiredError extends Error {},
}));

vi.mock('@/api', () => ({
  isAuthenticated: vi.fn(() => false),
}));

vi.mock('vbwd-view-component', () => ({
  formatMoney: (value: number) => `$${value}`,
  isZeroTotal: (value: number) => Number(value) === 0,
  payButtonLabelOverride: null,
  CouponInput: { name: 'CouponInput', template: '<div />' },
  useAuthStore: () => ({ user: null }),
}));

vi.mock('@/registries/checkoutPaymentMethods', () => ({ getCheckoutPaymentMethod: vi.fn() }));
vi.mock('@/registries/checkoutContextRegistry', () => ({
  checkoutContextRegistry: { component: { value: null } },
}));

const mockedHydrate = vi.mocked(hydrateCartFromDraft);

function mountView() {
  return shallowMount(PublicCheckoutView, {
    global: {
      plugins: [],
      mocks: { $t: (key: string) => key },
      stubs: {
        EmailBlock: true,
        PaymentMethodsBlock: true,
        TermsCheckbox: true,
        BillingAddressBlock: true,
        CouponInput: true,
        'router-link': true,
      },
    },
  });
}

describe('PublicCheckoutView ?draft hydration', () => {
  let loadForContext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    for (const key of Object.keys(routeQuery)) delete routeQuery[key];
    vi.clearAllMocks();
    mockedHydrate.mockResolvedValue(undefined);

    const store = useCheckoutStore();
    loadForContext = vi.fn().mockResolvedValue(undefined);
    // Drive the agnostic store's loadForContext while keeping the rest real.
    (store as unknown as { loadForContext: typeof loadForContext }).loadForContext = loadForContext;
  });

  it('with ?draft → hydrates the cart from the draft, then loads the cart-backed source', async () => {
    routeQuery.draft = 'tok-abc';
    mountView();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedHydrate).toHaveBeenCalledWith('tok-abc');
    expect(loadForContext).toHaveBeenCalledTimes(1);
    const ctx = loadForContext.mock.calls[0][0];
    expect(ctx.cartType).toBe('subscription');
    expect(ctx.isCart).toBe(true);
  });

  it('without ?draft → never hydrates and loads exactly as today (regression)', async () => {
    routeQuery.tarif_plan_id = 'pro';
    mountView();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedHydrate).not.toHaveBeenCalled();
    expect(loadForContext).toHaveBeenCalledTimes(1);
    const ctx = loadForContext.mock.calls[0][0];
    expect(ctx.planSlug).toBe('pro');
    expect(ctx.cartType).toBeUndefined();
  });

  it('on a 404 draft → shows the expired-link state and does not throw', async () => {
    routeQuery.draft = 'gone';
    mockedHydrate.mockRejectedValue(new DraftExpiredError());

    const wrapper = mountView();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="checkout-draft-expired"]').exists()).toBe(true);
    // It must not fall through to a normal cart load on an expired token.
    expect(loadForContext).not.toHaveBeenCalled();
  });
});
