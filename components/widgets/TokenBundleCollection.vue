<template>
  <div class="token-bundle-collection">
    <h2
      v-if="config.heading"
      class="token-bundle-collection__heading"
    >
      {{ config.heading }}
    </h2>

    <div
      v-if="loading"
      class="token-bundle-collection__state"
      data-testid="token-bundle-loading"
    >
      <div class="token-bundle-collection__spinner" />
    </div>

    <div
      v-else-if="error"
      class="token-bundle-collection__state"
      data-testid="token-bundle-error"
    >
      <p>{{ error }}</p>
    </div>

    <div
      v-else-if="bundles.length === 0"
      class="token-bundle-collection__state"
      data-testid="token-bundle-empty"
    >
      <p>{{ $t('tokens.noBundles') }}</p>
    </div>

    <template v-else>
      <CollectionToolbar
        v-model:search-query="collection.searchQuery.value"
        :view-mode="collection.viewMode.value"
        :sort-direction="collection.sortDirection.value"
        :search-placeholder="$t('common.search')"
        :sort-label="$t('tokens.sortByPrice')"
        :cards-label="$t('common.view')"
        :table-label="$t('common.view')"
        @toggle-sort="collection.toggleSort"
        @set-view="collection.setView"
      />

      <!-- Cards View -->
      <div
        v-if="collection.viewMode.value === 'cards'"
        class="token-bundle-collection__grid"
        data-testid="token-bundle-grid"
      >
        <div
          v-for="bundle in collection.visibleItems.value"
          :key="bundle.id"
          class="token-bundle-card"
          :data-testid="`token-bundle-card-${bundle.id}`"
        >
          <div class="token-bundle-card__amount">
            {{ $t('tokens.tokensLabel', { amount: formatTokenAmount(bundle.token_amount) }) }}
          </div>
          <div class="token-bundle-card__price">
            {{ formatBundlePrice(bundle) }}
          </div>
          <p
            v-if="bundle.description"
            class="token-bundle-card__description"
          >
            {{ bundle.description }}
          </p>
          <button
            type="button"
            class="token-bundle-card__add"
            :data-testid="`add-to-cart-${bundle.id}`"
            @click="addToCart(bundle)"
          >
            {{ $t('tokens.addToCart') }}
          </button>
        </div>
      </div>

      <!-- Table View -->
      <div
        v-else
        class="token-bundle-collection__table-wrapper"
      >
        <table
          class="token-bundle-collection__table"
          data-testid="token-bundle-table"
        >
          <thead>
            <tr>
              <th>{{ $t('tokens.tableHeaders.tokens') }}</th>
              <th>{{ $t('tokens.tableHeaders.price') }}</th>
              <th>{{ $t('tokens.tableHeaders.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="bundle in collection.visibleItems.value"
              :key="bundle.id"
              :data-testid="`token-bundle-row-${bundle.id}`"
            >
              <td>{{ formatTokenAmount(bundle.token_amount) }}</td>
              <td>{{ formatBundlePrice(bundle) }}</td>
              <td>
                <button
                  type="button"
                  class="token-bundle-collection__add-sm"
                  :data-testid="`add-to-cart-${bundle.id}`"
                  @click="addToCart(bundle)"
                >
                  {{ $t('tokens.addToCart') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * TokenBundleCollection — a CMS ``vue-component`` widget rendering a searchable
 * / sortable card-or-table collection of token bundles, with a user-facing view
 * toggle. Receives the single ``config`` prop the CmsWidgetRenderer passes
 * (``{ ...widget.config, widget_slug }``).
 *
 * Reuses the shared ``useCollectionView`` + ``CollectionToolbar`` for the
 * search/sort/view logic (DRY). Adding a bundle to the cart mirrors
 * vue/src/views/Tokens.vue ``addToCart()`` exactly — the fe-core cart store is
 * the single source of truth for checkout selections.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  useCartStore,
  useAuthStore,
  eventBus,
  AppEvents,
  formatMoney,
} from 'vbwd-view-component';
import { api } from '@/api';
import { useCollectionView } from '@/composables/useCollectionView';
import { resolvePriceDisplay, type PriceVO } from '@/utils/priceDisplay';
import CollectionToolbar from '@/components/CollectionToolbar.vue';

interface TokenBundle {
  id: string;
  name: string;
  token_amount: number;
  price: number | string;
  currency: string;
  description?: string;
  is_active: boolean;
  effective_display_mode?: 'netto' | 'brutto';
  prices_display_mode?: 'netto' | 'brutto';
  price_info?: { price?: PriceVO };
}

interface TokenBundleCollectionConfig {
  component_name?: string;
  widget_slug?: string;
  bundle_ids?: string[];
  default_view?: 'cards' | 'table';
  heading?: string;
}

const props = defineProps<{ config: TokenBundleCollectionConfig }>();

const { t } = useI18n();
const router = useRouter();
const cartStore = useCartStore();
const authStore = useAuthStore();

const allBundles = ref<TokenBundle[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const accountType = computed(() => authStore.user?.account_type);

const bundles = computed<TokenBundle[]>(() => {
  const wanted = props.config.bundle_ids ?? [];
  if (wanted.length === 0) return allBundles.value;
  return allBundles.value.filter((bundle) => wanted.includes(bundle.id));
});

function netPriceOf(bundle: TokenBundle): number {
  const netto = bundle.price_info?.price?.netto;
  if (netto != null) return Number(netto);
  return typeof bundle.price === 'string' ? parseFloat(bundle.price) : bundle.price;
}

const collection = useCollectionView<TokenBundle>({
  items: bundles,
  searchableText: (bundle) => `${bundle.name} ${bundle.description ?? ''}`,
  sortKey: netPriceOf,
  initialView: props.config.default_view ?? 'cards',
});

function formatBundlePrice(bundle: TokenBundle): string {
  const price = bundle.price_info?.price;
  const fallback = typeof bundle.price === 'string' ? parseFloat(bundle.price) : bundle.price;
  if (!price) {
    return formatMoney(fallback, { currency: bundle.currency });
  }
  const resolved = resolvePriceDisplay({
    effectiveDisplayMode: bundle.effective_display_mode,
    globalMode: bundle.prices_display_mode,
    netAmount: price.netto,
    grossAmount: price.brutto,
    accountType: accountType.value,
  });
  return formatMoney(resolved.amount, { currency: price.currency || bundle.currency });
}

function formatTokenAmount(amount: number): string {
  return new Intl.NumberFormat().format(amount);
}

function addToCart(bundle: TokenBundle): void {
  const numericPrice = netPriceOf(bundle);
  const name = `${formatTokenAmount(bundle.token_amount)} Tokens`;
  // Preserve the computed Price VO (netto / per-rate taxes / brutto) and its
  // currency so the bundle contributes its tax to the order-level breakdown on
  // checkout — mirroring the subscription store's addBundle(). Without these the
  // bundle has no tax data and the checkout shows no tax disclosure (and falls
  // back to the wrong currency, since the bare bundle.currency is null).
  const priceVO = bundle.price_info?.price;
  cartStore.addItem({
    type: 'TOKEN_BUNDLE',
    id: bundle.id,
    name,
    price: numericPrice,
    metadata: {
      token_amount: bundle.token_amount,
      currency: priceVO?.currency ?? bundle.currency,
      price_obj: priceVO,
    },
  });
  eventBus.emit(AppEvents.NOTIFICATION_SHOW, {
    type: 'success',
    message: t('cart.addedToCart', { name }),
    duration: 3000,
  });
  // Forward to the public checkout (the bundle is cart-backed; the subscription
  // checkout source renders cart token bundles). Mirrors the tariff-plan widget,
  // which routes to the public checkout on select. ``source=subscription`` lets
  // the subscription source claim a token-only cart (no plan slug present).
  router.push({ name: 'checkout-public', query: { source: 'subscription' } });
}

async function loadBundles(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const response = (await api.get('/token-bundles')) as { bundles: TokenBundle[] };
    allBundles.value = (response.bundles || []).filter((bundle) => bundle.is_active);
  } catch (caught: unknown) {
    const failure = caught as { response?: { data?: { error?: string } }; message?: string };
    error.value =
      failure.response?.data?.error || failure.message || t('tokens.errors.failedToLoad');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadBundles();
});
</script>

<style scoped>
.token-bundle-collection__heading {
  color: var(--vbwd-text-heading, #2c3e50);
  margin-bottom: 16px;
}

.token-bundle-collection__state {
  text-align: center;
  padding: 40px 20px;
  color: var(--vbwd-text-muted, #666);
}

.token-bundle-collection__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--vbwd-border-light, #f3f3f3);
  border-top: 3px solid var(--vbwd-color-primary, #3498db);
  border-radius: 50%;
  animation: token-bundle-spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes token-bundle-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.token-bundle-collection__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.token-bundle-card {
  background: var(--vbwd-card-bg, #fff);
  padding: 24px;
  border-radius: 8px;
  box-shadow: var(--vbwd-card-shadow, 0 2px 5px rgba(0, 0, 0, 0.05));
  border: 2px solid transparent;
  text-align: center;
  transition: all 0.2s;
}

.token-bundle-card:hover {
  transform: translateY(-4px);
  border-color: var(--vbwd-color-primary, #3498db);
}

.token-bundle-card__amount {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--vbwd-text-heading, #2c3e50);
  margin-bottom: 8px;
}

.token-bundle-card__price {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--vbwd-color-primary, #3498db);
  margin-bottom: 14px;
}

.token-bundle-card__description {
  color: var(--vbwd-text-muted, #666);
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.token-bundle-card__add,
.token-bundle-collection__add-sm {
  padding: 10px 16px;
  background-color: var(--vbwd-color-success, #27ae60);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
}

.token-bundle-card__add {
  width: 100%;
}

.token-bundle-collection__table-wrapper {
  overflow-x: auto;
}

.token-bundle-collection__table {
  width: 100%;
  border-collapse: collapse;
  background: var(--vbwd-card-bg, #fff);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--vbwd-card-shadow, 0 2px 5px rgba(0, 0, 0, 0.05));
}

.token-bundle-collection__table th {
  background: var(--vbwd-page-bg, #f8f9fa);
  padding: 12px 16px;
  text-align: left;
  font-size: 0.85rem;
  color: var(--vbwd-text-muted, #666);
}

.token-bundle-collection__table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--vbwd-border-light, #f0f0f0);
  color: var(--vbwd-text-body, #2c3e50);
}
</style>
