<template>
  <div class="public-checkout">
    <h1 data-testid="checkout-title">
      {{ $t('checkout.title') }}
    </h1>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="loading-state"
      data-testid="checkout-loading"
    >
      <div class="spinner" />
      <p>{{ $t('checkout.loading') }}</p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error && !checkoutStore.checkoutResult"
      class="error-state"
      data-testid="checkout-error"
    >
      <p>{{ error }}</p>
      <router-link
        to="/landing1"
        class="btn secondary"
      >
        {{ $t('common.backToPlans') }}
      </router-link>
    </div>

    <!-- Expired / already-redeemed bot checkout-draft link -->
    <div
      v-else-if="draftExpired"
      class="no-plan"
      data-testid="checkout-draft-expired"
    >
      <p>{{ $t('checkout.draftExpired') }}</p>
      <router-link
        to="/landing1"
        class="btn primary"
      >
        {{ $t('common.browsePlans') }}
      </router-link>
    </div>

    <!-- Nothing to check out (no matching checkout source for this route) -->
    <div
      v-else-if="!checkoutStore.hasActiveSource"
      class="no-plan"
      data-testid="checkout-no-plan"
    >
      <p>{{ $t('checkout.noPlanSelected') }}</p>
      <router-link
        to="/landing1"
        class="btn primary"
      >
        {{ $t('common.browsePlans') }}
      </router-link>
    </div>

    <!-- Checkout Form -->
    <div
      v-else-if="checkoutStore.hasActiveSource"
      class="checkout-content"
    >
      <!-- Step 1: Email Block (login/register or logged-in display) -->
      <EmailBlock
        :initial-email="userEmail"
        :is-authenticated="isAuthenticated"
        class="card"
        @authenticated="handleAuthenticated"
        @logout="handleLogout"
      />

      <!-- Plugin-injected context banner (e.g. GHRM "Getting access to: …") -->
      <component
        :is="checkoutContextRegistry.component.value"
        v-if="checkoutContextRegistry.component.value"
        data-testid="checkout-context-banner"
      />

      <!-- Order Summary — rendered by the active checkout source (plugin) -->
      <div
        class="card order-summary"
        data-testid="order-summary"
      >
        <h2>{{ $t('checkout.orderSummary.title') }}</h2>
        <component
          :is="checkoutStore.summaryComponent"
          v-if="checkoutStore.summaryComponent"
          data-testid="checkout-order-summary"
        />

        <!-- A coupon only makes sense when there is something to pay. -->
        <CouponInput
          v-if="hasPayableTotal"
          class="checkout-coupon"
          :applied-code="checkoutStore.couponCode"
          :error="checkoutStore.couponError"
          :loading="checkoutStore.applyingCoupon"
          @apply="onApplyCoupon"
          @clear="checkoutStore.clearCoupon"
        />

        <!-- Order-level tax breakdown (net / total taxes / brutto) across every
             line item, just before the Total. Rendered only when the active
             source supplies an aggregated breakdown with taxes. -->
        <OrderTaxSummary
          v-if="checkoutStore.taxBreakdown"
          :price="checkoutStore.taxBreakdown"
          class="checkout-tax-summary"
        />

        <div
          class="order-total"
          data-testid="order-total"
        >
          <strong data-testid="order-total-amount">
            {{ checkoutStore.discountAmount > 0
              ? $t('checkout.orderSummary.finalPrice')
              : $t('checkout.orderSummary.total') }}
            <PriceDisplay
              :net-amount="Number(checkoutStore.orderTotal)"
              :gross-amount="Number(checkoutStore.orderTotal)"
              :currency="checkoutStore.currency"
              :account-type="authStore.user?.account_type"
            />
          </strong>
          <div
            v-if="checkoutStore.discountAmount > 0"
            class="order-saved"
            data-testid="order-discount"
          >
            {{ $t('checkout.orderSummary.youSaved') }} {{ formattedDiscount }}
          </div>
        </div>
      </div>

      <!-- Step 2: Billing Address (hidden when there is nothing to pay) -->
      <BillingAddressBlock
        v-if="hasPayableTotal"
        :key="isAuthenticated ? 'auth' : 'anon'"
        class="card"
        @valid="handleBillingAddressValid"
      />

      <!-- Step 3: Payment Methods (hidden when there is nothing to pay) -->
      <PaymentMethodsBlock
        v-if="!isPayZero"
        class="card"
        :amount="checkoutStore.orderTotal"
        :currency="checkoutStore.currency"
        @selected="handlePaymentMethodSelected"
      />

      <!-- Step 4: Terms and Conditions -->
      <TermsCheckbox @change="handleTermsChange" />

      <!-- Requirements Status -->
      <div
        v-if="missingRequirements.length > 0"
        class="requirements"
        data-testid="checkout-requirements"
      >
        <p><strong>{{ $t('checkout.requirements.title') }}</strong></p>
        <ul>
          <li
            v-for="req in missingRequirements"
            :key="req"
          >
            {{ req }}
          </li>
        </ul>
      </div>

      <!-- Confirm Section -->
      <div class="checkout-actions">
        <router-link
          to="/landing1"
          class="btn secondary"
        >
          {{ $t('common.backToPlans') }}
        </router-link>
        <button
          data-testid="confirm-checkout"
          class="btn primary pay-button"
          :disabled="!canCheckout"
          @click="checkoutStore.submitCheckout"
        >
          {{ checkoutStore.submitting ? $t('checkout.submitting') : (isPayZero ? $t('checkout.activateFree') : (payButtonLabelOverride || $t('checkout.payButton', { amount: formattedTotalForButton }))) }}
        </button>
      </div>

      <!-- Error Display -->
      <div
        v-if="checkoutStore.error"
        data-testid="checkout-form-error"
        class="error-message"
      >
        {{ checkoutStore.error }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { formatMoney, isZeroTotal, payButtonLabelOverride, CouponInput, useAuthStore } from 'vbwd-view-component';
import { useCheckoutStore } from '@/stores/checkout';
import { useAppConfigStore } from '@/stores/appConfig';
import { isAuthenticated as checkAuth } from '@/api';
import EmailBlock from '@/components/checkout/EmailBlock.vue';
import PaymentMethodsBlock from '@/components/checkout/PaymentMethodsBlock.vue';
import { getCheckoutPaymentMethod } from '@/registries/checkoutPaymentMethods';
import TermsCheckbox from '@/components/checkout/TermsCheckbox.vue';
import BillingAddressBlock from '@/components/checkout/BillingAddressBlock.vue';
import { checkoutContextRegistry } from '@/registries/checkoutContextRegistry';
import { hydrateCartFromDraft, DraftExpiredError } from './draftCheckout';
import PriceDisplay from '@/components/PriceDisplay.vue';
import OrderTaxSummary from '@/components/OrderTaxSummary.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const checkoutStore = useCheckoutStore();
const appConfig = useAppConfigStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref<string | null>(null);
// Set when a `?draft=<token>` bot checkout-draft link is expired / redeemed.
const draftExpired = ref(false);

// Pre-format the order total so the Pay button never leaks IEEE-754 noise
// (e.g. ``Pay $39.989999999999995``). Rounded half-up at the 3rd decimal.
const formattedTotalForButton = computed(() =>
  formatMoney(Number(checkoutStore.orderTotal), { currency: checkoutStore.currency }),
);

const formattedDiscount = computed(() =>
  formatMoney(Number(checkoutStore.discountAmount), { currency: checkoutStore.currency }),
);

// Gross (pre-discount) total drives coupon-input + billing visibility.
const hasPayableTotal = computed(
  () => Number(checkoutStore.orderTotal) + Number(checkoutStore.discountAmount) > 0,
);
// Pay Zero keys off the NET total — a checkout discounted to zero needs no
// payment method either.
const isPayZero = computed(() => isZeroTotal(checkoutStore.orderTotal));

async function onApplyCoupon(code: string): Promise<void> {
  await checkoutStore.applyCoupon(code);
}

// Auth state
const isAuthenticated = ref(checkAuth());
const userEmail = ref(localStorage.getItem('user_email') || '');

// Form state
const selectedPaymentMethod = ref<string | null>(null);
const termsAccepted = ref(false);
const billingAddressValid = ref(false);

// Plan slug from query params
const planSlug = computed(() => route.query.tarif_plan_id as string || '');

// One-time bot checkout-draft token (S53.1). When present, the cart is seeded
// from the draft before the normal cart-backed checkout runs.
const draftToken = computed(() => route.query.draft as string || '');

// Handle authentication from EmailBlock
const handleAuthenticated = (_userId: string) => {
  isAuthenticated.value = true;
};

const handleLogout = () => {
  isAuthenticated.value = false;
  userEmail.value = '';
};

const handlePaymentMethodSelected = (methodCode: string) => {
  selectedPaymentMethod.value = methodCode;
  checkoutStore.setPaymentMethod(methodCode);
};

const handleTermsChange = (accepted: boolean) => {
  termsAccepted.value = accepted;
};

const handleBillingAddressValid = (isValid: boolean) => {
  billingAddressValid.value = isValid;
};

// Pay Zero: when there's nothing to pay (net total 0) no payment method is
// required; billing is still collected whenever the order has a gross price.
const canCheckout = computed(() =>
  isAuthenticated.value &&
  (isPayZero.value || !!selectedPaymentMethod.value) &&
  (!hasPayableTotal.value || billingAddressValid.value) &&
  termsAccepted.value &&
  !checkoutStore.submitting
);

const missingRequirements = computed(() => {
  const missing: string[] = [];
  if (!isAuthenticated.value) missing.push(t('checkout.requirements.signIn'));
  if (hasPayableTotal.value && !billingAddressValid.value) missing.push(t('checkout.requirements.billingAddress'));
  if (!isPayZero.value && !selectedPaymentMethod.value) missing.push(t('checkout.requirements.paymentMethod'));
  if (!termsAccepted.value) missing.push(t('checkout.requirements.acceptTerms'));
  return missing;
});

// Agnostic post-checkout dispatch: the registered entry for the selected
// method tells us what to do. Core knows no method codes.
//
//   instantPay  → finish in-band, then /checkout/confirmation
//   redirectPath → hop to the plugin's /pay/<name> page
//   nothing      → straight to /checkout/confirmation
//
// Gateway plugins (stripe / paypal / yookassa / …) register redirectPath;
// in-band plugins (token-payment) register instantPay.
watch(() => checkoutStore.checkoutResult, async (result) => {
  if (!result) return;
  const invoiceId = result.invoice?.id;
  if (!invoiceId) return;

  const method = checkoutStore.paymentMethodCode;
  const entry = method ? getCheckoutPaymentMethod(method) : undefined;

  if (entry?.instantPay) {
    try {
      await entry.instantPay(invoiceId);
    } catch (err) {
      // The detail component / API surfaces the failure; we still land on
      // confirmation so the user can see the invoice state.
      console.warn('[checkout] instantPay failed for', method, err);
    }
    router.push({ path: '/checkout/confirmation', query: { invoice_id: invoiceId } });
    return;
  }

  if (entry?.redirectPath) {
    router.push(entry.redirectPath(invoiceId));
    return;
  }

  router.push({ path: '/checkout/confirmation', query: { invoice_id: invoiceId } });
});

onMounted(async () => {
  loading.value = true;
  // Ensure the global operating currency is available before the summary renders.
  await appConfig.load();
  try {
    // Bot checkout-draft hand-off (S53.1): seed the fe-core cart from the draft,
    // then proceed as a normal cart-backed checkout. No new checkout logic — the
    // cart is the single source of truth the subscription source already reads.
    if (draftToken.value) {
      try {
        await hydrateCartFromDraft(draftToken.value);
      } catch (draftError) {
        if (draftError instanceof DraftExpiredError) {
          draftExpired.value = true;
          return;
        }
        throw draftError;
      }
      await checkoutStore.loadForContext({ cartType: 'subscription', isCart: true });
      error.value = checkoutStore.error;
      return;
    }

    // Generic: the registry picks the plugin source matching this route
    // (e.g. ?source=shop → shop cart; ?tarif_plan_id=… → subscription plan).
    await checkoutStore.loadForContext({
      source: (route.query.source as string) || undefined,
      planSlug: planSlug.value || undefined,
    });
    error.value = checkoutStore.error;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  checkoutStore.reset();
});
</script>

<style scoped>
.public-checkout {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
}

/* Space the coupon block away from the order items and the final total. */
.checkout-coupon {
  margin: 16px 0;
}

/* The order-level tax breakdown sits between the summary and the Total. */
.checkout-tax-summary {
  margin-top: 12px;
}

/* Final total — mirrors the plan/shop summary `.total` look. */
.order-total {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  text-align: right;
  font-size: 1.1rem;
}

.order-saved {
  margin-top: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--vbwd-success, #047857);
}

h1 {
  margin-bottom: 30px;
  color: #2c3e50;
}

.loading-state,
.error-state,
.no-plan {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.checkout-content,
.checkout-success {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: white;
  padding: 25px;
  border-radius: 8px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.card h2 {
  margin-bottom: 20px;
  color: #2c3e50;
  font-size: 1.2rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.plan-details {
  margin-bottom: 20px;
}

.plan-row {
  display: flex;
  justify-content: space-between;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.plan-description {
  color: #666;
  font-size: 0.9rem;
  margin-top: 8px;
}

.total {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 2px solid #eee;
  font-size: 1.2rem;
  text-align: right;
}

.status-info {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.status-info p {
  margin: 8px 0;
  color: #2c3e50;
}

.checkout-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding-top: 10px;
}

.requirements {
  background: #fff3cd;
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
  border: 1px solid #ffc107;
}

.requirements p {
  margin: 0 0 8px 0;
  color: #856404;
}

.requirements ul {
  margin: 0;
  padding-left: 20px;
  color: #856404;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: background-color 0.2s;
}

.btn.primary {
  background-color: #3498db;
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background-color: #2980b9;
}

.btn.primary:disabled {
  background-color: #95a5a6;
  cursor: not-allowed;
}

.btn.secondary {
  background-color: #ecf0f1;
  color: #2c3e50;
}

.btn.secondary:hover {
  background-color: #bdc3c7;
}

.error-message {
  background: #fee;
  color: #c00;
  padding: 15px;
  border-radius: 8px;
  margin-top: 15px;
}

.pay-button {
  min-width: 180px;
}

@media (max-width: 600px) {
  .checkout-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
    text-align: center;
  }
}
</style>
