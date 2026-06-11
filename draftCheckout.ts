/**
 * Bot checkout-draft hydration (S53.1 / D8).
 *
 * The bot storefront (S53.0) hands a browser user a one-time link
 * `/checkout?draft=<token>`. This helper resolves that token against the public
 * draft endpoint and seeds the fe-core cart — the single source of truth for the
 * cart-backed public checkout ([[project_checkout_cart_backed_selections]]) —
 * with the draft's **server-recomputed** line items.
 *
 * It adds NO checkout logic and computes NO prices: it merely maps the generic
 * `{item_type, item_id, quantity, name, unit_price}` line items returned by the
 * endpoint onto the cart item shape the existing subscription checkout source
 * already reads. The view then proceeds exactly as today's cart-backed checkout.
 */
import { useCartStore } from 'vbwd-view-component';
import { api } from '@/api';

/** A line item as returned by the public draft-resolution endpoint. */
interface DraftLineItem {
  item_type: string;
  item_id: string;
  quantity: number;
  name: string;
  unit_price: string | null;
  currency: string | null;
}

interface DraftResponse {
  line_items: DraftLineItem[];
}

/**
 * The core `LineItemType` vocabulary the draft persists, mapped to the fe-core
 * cart item `type` strings the subscription checkout source reads. Subscriptions
 * are a "PLAN" in the cart; add-ons and token bundles keep their names.
 */
const CART_ITEM_TYPE_BY_LINE_ITEM_TYPE: Record<string, string> = {
  SUBSCRIPTION: 'PLAN',
  ADD_ON: 'ADD_ON',
  TOKEN_BUNDLE: 'TOKEN_BUNDLE',
};

/** Raised when the draft token is unknown, expired, or already redeemed (404). */
export class DraftExpiredError extends Error {
  constructor(message = 'Checkout draft expired') {
    super(message);
    this.name = 'DraftExpiredError';
  }
}

function parsePrice(rawPrice: string | null): number {
  if (rawPrice === null) return 0;
  const parsed = parseFloat(rawPrice);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCartItem(lineItem: DraftLineItem) {
  const cartType = CART_ITEM_TYPE_BY_LINE_ITEM_TYPE[lineItem.item_type];
  return {
    type: cartType,
    id: lineItem.item_id,
    name: lineItem.name,
    price: parsePrice(lineItem.unit_price),
    metadata: {
      // The subscription checkout store reads the plan's submit UUID from
      // `metadata.plan_id`; for add-ons/bundles the id alone is enough but
      // carrying it costs nothing and keeps the shape uniform.
      plan_id: lineItem.item_id,
      currency: lineItem.currency ?? 'USD',
    },
  };
}

/**
 * Resolve the draft token and seed the fe-core cart from its line items.
 *
 * The cart is cleared first so the draft IS the selection (no stale carry-over).
 * On a 404 (expired / already-redeemed / unknown token) the cart is left
 * untouched and `DraftExpiredError` is thrown for the view to render its
 * expired-link state.
 */
export async function hydrateCartFromDraft(token: string): Promise<void> {
  let response: DraftResponse;
  try {
    response = await api.get<DraftResponse>(`/subscription/public/checkout-draft/${token}`);
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) {
      throw new DraftExpiredError();
    }
    throw error;
  }

  const cart = useCartStore();
  cart.clearCart();

  for (const lineItem of response.line_items) {
    const cartType = CART_ITEM_TYPE_BY_LINE_ITEM_TYPE[lineItem.item_type];
    if (!cartType) {
      // An unknown item_type can't be rendered by any checkout source — skip it
      // rather than fabricate a cart entry.
      continue;
    }
    const cartItem = toCartItem(lineItem);
    const quantity = Math.max(1, Math.trunc(lineItem.quantity) || 1);
    for (let added = 0; added < quantity; added += 1) {
      cart.addItem(cartItem);
    }
  }
}
