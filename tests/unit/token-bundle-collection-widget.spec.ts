/**
 * TokenBundleCollection CMS vue-component widget.
 *
 * A searchable / sortable / card-or-table collection of token bundles that a
 * CMS editor drops into a layout. Receives the single ``config`` prop
 * (``{ ...widget.config, widget_slug }``), fetches bundles from /token-bundles,
 * and adds the selected bundle to the fe-core cart on purchase — mirroring
 * vue/src/views/Tokens.vue addToCart().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';

const { apiGet, addItem, emit } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  addItem: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('@/api', () => ({ api: { get: (...args: unknown[]) => apiGet(...args) } }));

vi.mock('vbwd-view-component', async () => {
  const actual = await vi.importActual<typeof import('vbwd-view-component')>('vbwd-view-component');
  return {
    ...actual,
    useCartStore: () => ({ addItem }),
    useAuthStore: () => ({ user: null }),
    eventBus: { emit },
    AppEvents: { NOTIFICATION_SHOW: 'NOTIFICATION_SHOW' },
  };
});

import TokenBundleCollection from '../../components/widgets/TokenBundleCollection.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  missing: (_locale, key) => key,
  messages: { en: {} },
});

interface BundleResponse {
  id: string;
  name: string;
  token_amount: number;
  price: number;
  currency: string;
  description?: string;
  is_active: boolean;
  effective_display_mode?: 'netto' | 'brutto';
  prices_display_mode?: 'netto' | 'brutto';
  price_info?: { price: { netto: number; brutto: number; currency: string; taxes: [] } };
}

function makeBundle(overrides: Partial<BundleResponse>): BundleResponse {
  const netto = overrides.price ?? 10;
  return {
    id: `bundle-${overrides.name}`,
    name: 'Bundle',
    token_amount: 100,
    price: netto,
    currency: 'EUR',
    is_active: true,
    effective_display_mode: 'brutto',
    prices_display_mode: 'brutto',
    price_info: { price: { netto, brutto: netto * 1.2, currency: 'EUR', taxes: [] } },
    ...overrides,
  };
}

const BUNDLES: BundleResponse[] = [
  makeBundle({ id: 'b-gamma', name: 'Gamma', description: 'starter', price: 5 }),
  makeBundle({ id: 'b-alpha', name: 'Alpha', description: 'enterprise', price: 30 }),
  makeBundle({ id: 'b-beta', name: 'Beta', description: 'business', price: 15 }),
  makeBundle({ id: 'b-old', name: 'Retired', description: 'inactive', price: 1, is_active: false }),
];

async function mountWidget(config: Record<string, unknown>, bundles: BundleResponse[] = BUNDLES) {
  apiGet.mockResolvedValue({ bundles });
  const wrapper = mount(TokenBundleCollection, {
    props: { config: { component_name: 'TokenBundleCollection', widget_slug: 'bundles-1', ...config } },
    global: { plugins: [i18n] },
  });
  await flushPromises();
  return wrapper;
}

function cardIds(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('[data-testid^="token-bundle-card-"]')
    .map((node) => node.attributes('data-testid')!.replace('token-bundle-card-', ''));
}

describe('TokenBundleCollection widget', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders active bundle cards sorted by ascending net price', async () => {
    const wrapper = await mountWidget({});
    expect(cardIds(wrapper)).toEqual(['b-gamma', 'b-beta', 'b-alpha']);
  });

  it('excludes inactive bundles', async () => {
    const wrapper = await mountWidget({});
    expect(cardIds(wrapper)).not.toContain('b-old');
  });

  it('honours config.default_view = table', async () => {
    const wrapper = await mountWidget({ default_view: 'table' });
    expect(wrapper.find('[data-testid="token-bundle-table"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="token-bundle-row-"]').length).toBe(3);
  });

  it('filters the list by the search input (name + description)', async () => {
    const wrapper = await mountWidget({});
    await wrapper.get('[data-testid="collection-search"]').setValue('enterprise');
    expect(cardIds(wrapper)).toEqual(['b-alpha']);
  });

  it('flips the price sort from ascending to descending on toggle', async () => {
    const wrapper = await mountWidget({});
    await wrapper.get('[data-testid="collection-sort-toggle"]').trigger('click');
    expect(cardIds(wrapper)).toEqual(['b-alpha', 'b-beta', 'b-gamma']);
  });

  it('toggles to the table view at runtime', async () => {
    const wrapper = await mountWidget({ default_view: 'cards' });
    expect(wrapper.find('[data-testid="token-bundle-table"]').exists()).toBe(false);
    await wrapper.get('[data-testid="collection-view-table"]').trigger('click');
    expect(wrapper.find('[data-testid="token-bundle-table"]').exists()).toBe(true);
  });

  it('adds the bundle to the cart with the correct payload', async () => {
    const wrapper = await mountWidget({});
    await wrapper.get('[data-testid="add-to-cart-b-gamma"]').trigger('click');
    expect(addItem).toHaveBeenCalledTimes(1);
    const payload = addItem.mock.calls[0][0];
    expect(payload).toMatchObject({ type: 'TOKEN_BUNDLE', id: 'b-gamma', price: 5 });
    expect(emit).toHaveBeenCalledWith('NOTIFICATION_SHOW', expect.objectContaining({ type: 'success' }));
  });

  it('keeps only the configured bundle ids when bundle_ids is set', async () => {
    const wrapper = await mountWidget({ bundle_ids: ['b-beta', 'b-gamma'] });
    expect(cardIds(wrapper).sort()).toEqual(['b-beta', 'b-gamma']);
  });

  it('shows all active bundles when bundle_ids is empty', async () => {
    const wrapper = await mountWidget({ bundle_ids: [] });
    expect(cardIds(wrapper).sort()).toEqual(['b-alpha', 'b-beta', 'b-gamma']);
  });
});
