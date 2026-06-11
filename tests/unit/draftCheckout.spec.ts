import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { hydrateCartFromDraft, DraftExpiredError } from '../../draftCheckout';
import { useCartStore } from 'vbwd-view-component';
import { api } from '@/api';

vi.mock('@/api', () => ({
  api: { get: vi.fn() },
}));

// Reactive in-memory fake of the fe-core cart store — mirrors the real public
// contract used by the subscription checkout source (addItem/getItemsByType/…).
vi.mock('vbwd-view-component', async () => {
  const { reactive } = await import('vue');
  const items = reactive<
    Array<{ type: string; id: string; name: string; price: number; quantity: number; metadata?: Record<string, unknown> }>
  >([]);
  const cart = {
    items,
    get isEmpty() {
      return items.length === 0;
    },
    addItem(input: { type: string; id: string; name: string; price: number; metadata?: Record<string, unknown> }) {
      const existing = items.findIndex((it) => it.id === input.id && it.type === input.type);
      if (existing >= 0) items[existing].quantity += 1;
      else items.push({ ...input, quantity: 1 });
    },
    removeItem(id: string) {
      const i = items.findIndex((it) => it.id === id);
      if (i >= 0) items.splice(i, 1);
    },
    getItemById(id: string) {
      return items.find((it) => it.id === id);
    },
    getItemsByType(type: string) {
      return items.filter((it) => it.type === type);
    },
    clearCart() {
      items.splice(0, items.length);
    },
  };
  return { useCartStore: () => cart };
});

const cart = () => useCartStore();
const mockedGet = vi.mocked(api.get);

describe('hydrateCartFromDraft', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    cart().clearCart();
    vi.clearAllMocks();
  });

  it('fetches the public draft endpoint with the token', async () => {
    mockedGet.mockResolvedValue({ line_items: [] });

    await hydrateCartFromDraft('tok-123');

    expect(mockedGet).toHaveBeenCalledWith('/subscription/public/checkout-draft/tok-123');
  });

  it('maps a SUBSCRIPTION line item to a PLAN cart item with the recomputed price', async () => {
    mockedGet.mockResolvedValue({
      line_items: [
        {
          item_type: 'SUBSCRIPTION',
          item_id: 'plan-uuid-1',
          quantity: 1,
          name: 'Pro Plan',
          unit_price: '19.00',
          currency: 'USD',
        },
      ],
    });

    await hydrateCartFromDraft('tok-123');

    const planItems = cart().getItemsByType('PLAN');
    expect(planItems).toHaveLength(1);
    expect(planItems[0].id).toBe('plan-uuid-1');
    expect(planItems[0].name).toBe('Pro Plan');
    expect(planItems[0].price).toBe(19);
    // The subscription checkout store reads the submit UUID from metadata.plan_id.
    expect(planItems[0].metadata?.plan_id).toBe('plan-uuid-1');
    expect(planItems[0].metadata?.currency).toBe('USD');
  });

  it('maps ADD_ON and TOKEN_BUNDLE line items to the matching cart types', async () => {
    mockedGet.mockResolvedValue({
      line_items: [
        { item_type: 'ADD_ON', item_id: 'addon-1', quantity: 1, name: 'Extra Seats', unit_price: '5.00', currency: 'USD' },
        {
          item_type: 'TOKEN_BUNDLE',
          item_id: 'bundle-1',
          quantity: 1,
          name: '1000 Tokens',
          unit_price: '10.00',
          currency: null,
        },
      ],
    });

    await hydrateCartFromDraft('tok-123');

    const addons = cart().getItemsByType('ADD_ON');
    const bundles = cart().getItemsByType('TOKEN_BUNDLE');
    expect(addons).toHaveLength(1);
    expect(addons[0].id).toBe('addon-1');
    expect(addons[0].price).toBe(5);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].id).toBe('bundle-1');
    expect(bundles[0].price).toBe(10);
  });

  it('replaces any pre-existing cart contents (the draft is the selection)', async () => {
    cart().addItem({ type: 'PLAN', id: 'stale-plan', name: 'Stale', price: 99 });
    mockedGet.mockResolvedValue({
      line_items: [
        { item_type: 'SUBSCRIPTION', item_id: 'plan-uuid-1', quantity: 1, name: 'Pro Plan', unit_price: '19.00', currency: 'USD' },
      ],
    });

    await hydrateCartFromDraft('tok-123');

    const planItems = cart().getItemsByType('PLAN');
    expect(planItems).toHaveLength(1);
    expect(planItems[0].id).toBe('plan-uuid-1');
  });

  it('respects quantity on a line item', async () => {
    mockedGet.mockResolvedValue({
      line_items: [
        { item_type: 'TOKEN_BUNDLE', item_id: 'bundle-1', quantity: 3, name: '1000 Tokens', unit_price: '10.00', currency: null },
      ],
    });

    await hydrateCartFromDraft('tok-123');

    expect(cart().getItemById('bundle-1')?.quantity).toBe(3);
  });

  it('throws DraftExpiredError on a 404 (expired / already-redeemed / unknown token)', async () => {
    mockedGet.mockRejectedValue({ response: { status: 404 } });

    await expect(hydrateCartFromDraft('gone')).rejects.toBeInstanceOf(DraftExpiredError);
    // The cart must be left untouched on a failed resolution.
    expect(cart().items).toHaveLength(0);
  });
});
