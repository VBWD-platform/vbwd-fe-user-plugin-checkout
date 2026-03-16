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

    <!-- No Plan Selected -->
    <div
      v-else-if="!planSlug"
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

    <!-- Checkout Success -->
    <div
      v-else-if="checkoutStore.checkoutResult"
      class="checkout-success"
      data-testid="checkout-success"
    >
      <h2>{{ $t('checkout.success.title') }}</h2>

      <div class="status-info">
        <p
          v-if="checkoutStore.checkoutResult.subscription"
        >
          {{ $t('checkout.success.subscriptionStatus') }}
          <span data-testid="subscription-status">
            {{ checkoutStore.checkoutResult.subscription.status === 'PENDING' ? $t('checkout.success.statusPending') : $t('checkout.success.statusActive') }}
          </span>
        </p>
        <p data-testid="invoice-number">
          {{ $t('checkout.success.invoiceLabel') }} {{ checkoutStore.checkoutResult.invoice.invoice_number }}
        </p>
      </div>

      <div class="checkout-actions">
        <router-link
          to="/landing1"
          class="btn secondary"
        >
          {{ $t('common.backToPlans') }}
        </router-link>
      </div>
    </div>

    <!-- Checkout Form -->
    <div
      v-else-if="checkoutStore.plan"
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

      <!-- Order Summary -->
      <div
        class="card order-summary"
        data-testid="order-summary"
      >
        <h2>{{ $t('checkout.orderSummary.title') }}</h2>
        <div class="plan-details">
          <div class="plan-row">
            <span data-testid="plan-name">{{ checkoutStore.plan.name }}</span>
            <span data-testid="plan-price">${{ getPlanPrice() }}/{{ formatBillingPeriod(checkoutStore.plan.billing_period) }}</span>
          </div>
          <p
            v-if="checkoutStore.plan.description"
            class="plan-description"
          >
            {{ checkoutStore.plan.description }}
          </p>
        </div>
        <div class="total">
          <strong>{{ $t('checkout.success.totalLabel') }} ${{ checkoutStore.orderTotal }}</strong>
        </div>
      </div>

      <!-- Step 2: Billing Address -->
      <BillingAddressBlock
        :key="isAuthenticated ? 'auth' : 'anon'"
        class="card"
        @valid="handleBillingAddressValid"
      />

      <!-- Step 3: Payment Methods -->
      <PaymentMethodsBlock
        class="card"
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
          {{ checkoutStore.submitting ? $t('checkout.submitting') : $t('checkout.payButton', { amount: checkoutStore.orderTotal }) }}
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
import { useCheckoutStore } from '@/stores/checkout';
import { isAuthenticated as checkAuth } from '@/api';
import EmailBlock from '@/components/checkout/EmailBlock.vue';
import PaymentMethodsBlock from '@/components/checkout/PaymentMethodsBlock.vue';
import TermsCheckbox from '@/components/checkout/TermsCheckbox.vue';
import BillingAddressBlock from '@/components/checkout/BillingAddressBlock.vue';
import { checkoutContextRegistry } from './checkoutContextRegistry';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const checkoutStore = useCheckoutStore();

const loading = ref(false);
const error = ref<string | null>(null);

// Auth state
const isAuthenticated = ref(checkAuth());
const userEmail = ref(localStorage.getItem('user_email') || '');

// Form state
const selectedPaymentMethod = ref<string | null>(null);
const termsAccepted = ref(false);
const billingAddressValid = ref(false);

// Plan slug from query params
const planSlug = computed(() => route.query.tarif_plan_id as string || '');

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

const canCheckout = computed(() =>
  isAuthenticated.value &&
  selectedPaymentMethod.value &&
  billingAddressValid.value &&
  termsAccepted.value &&
  !checkoutStore.submitting
);

const missingRequirements = computed(() => {
  const missing: string[] = [];
  if (!isAuthenticated.value) missing.push(t('checkout.requirements.signIn'));
  if (!billingAddressValid.value) missing.push(t('checkout.requirements.billingAddress'));
  if (!selectedPaymentMethod.value) missing.push(t('checkout.requirements.paymentMethod'));
  if (!termsAccepted.value) missing.push(t('checkout.requirements.acceptTerms'));
  return missing;
});

function getPlanPrice(): number {
  return checkoutStore.plan?.price || checkoutStore.plan?.display_price || 0;
}

function formatBillingPeriod(period?: string): string {
  if (!period) return t('common.billingPeriods.month');
  const periodMap: Record<string, string> = {
    monthly: t('common.billingPeriods.month'),
    yearly: t('common.billingPeriods.year'),
    annual: t('common.billingPeriods.year'),
    weekly: t('common.billingPeriods.week'),
    MONTHLY: t('common.billingPeriods.month'),
    YEARLY: t('common.billingPeriods.year'),
  };
  return periodMap[period] || period.toLowerCase();
}

// Redirect to payment provider when checkout succeeds
watch(() => checkoutStore.checkoutResult, (result) => {
  if (result && checkoutStore.paymentMethodCode === 'stripe') {
    const invoiceId = result.invoice?.id;
    if (invoiceId) {
      router.push({ path: '/pay/stripe', query: { invoice: invoiceId } });
    }
  } else if (result && checkoutStore.paymentMethodCode === 'paypal') {
    const invoiceId = result.invoice?.id;
    if (invoiceId) {
      router.push({ path: '/pay/paypal', query: { invoice: invoiceId } });
    }
  }
});

onMounted(async () => {
  if (planSlug.value) {
    loading.value = true;
    try {
      await checkoutStore.loadPlan(planSlug.value);
      error.value = checkoutStore.error;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
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
