<template>
  <div class="public-checkout">
    <!-- Loading -->
    <div
      v-if="loading"
      class="loading-state"
    >
      <div class="spinner" />
      <p>{{ $t('checkout.confirmation.verifying') }}</p>
    </div>

    <template v-else>
      <!-- Status Banner -->
      <div
        class="confirmation-banner"
        :class="`confirmation-banner--${paymentStatus}`"
      >
        <h1>{{ statusTitle }}</h1>
        <p>{{ statusMessage }}</p>
      </div>

      <div class="checkout-content">
        <!-- Invoice & Payment Details (agnostic — always shown) -->
        <div class="card">
          <h2>{{ $t('checkout.confirmation.paymentDetails') }}</h2>
          <div class="confirmation-grid">
            <div
              v-if="invoiceNumber"
              class="confirmation-row"
            >
              <span class="confirmation-label">{{ $t('checkout.confirmation.invoiceNumber') }}</span>
              <span class="confirmation-value confirmation-mono">{{ invoiceNumber }}</span>
            </div>
            <div
              v-if="invoiceId"
              class="confirmation-row"
            >
              <span class="confirmation-label">{{ $t('checkout.confirmation.invoiceId') }}</span>
              <span class="confirmation-value confirmation-mono">{{ invoiceId }}</span>
            </div>
            <div class="confirmation-row">
              <span class="confirmation-label">{{ $t('checkout.confirmation.status') }}</span>
              <span class="confirmation-value">
                <span
                  class="status-badge"
                  :class="paymentStatus"
                >{{ paymentStatus }}</span>
              </span>
            </div>
            <div
              v-if="totalAmount"
              class="confirmation-row"
            >
              <span class="confirmation-label">{{ $t('checkout.confirmation.amount') }}</span>
              <span class="confirmation-value"><strong>{{ totalAmount }} {{ currency }}</strong></span>
            </div>
            <div
              v-if="paymentDate"
              class="confirmation-row"
            >
              <span class="confirmation-label">{{ $t('checkout.confirmation.date') }}</span>
              <span class="confirmation-value">{{ paymentDate }}</span>
            </div>
          </div>
        </div>

        <!-- Plugin-injected confirmation details (e.g., booking resource info) -->
        <component
          :is="plugin.component"
          v-for="plugin in confirmationPlugins"
          :key="plugin.name"
          :invoice-id="invoiceId"
          :invoice-data="invoiceData"
          class="card"
        />

        <!-- Actions -->
        <div class="checkout-actions">
          <router-link
            to="/"
            class="btn secondary"
          >
            {{ $t('checkout.confirmation.backToHome') }}
          </router-link>
          <router-link
            to="/dashboard/invoices"
            class="btn primary"
          >
            {{ $t('checkout.confirmation.viewInvoices') }}
          </router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { checkoutConfirmationRegistry } from './checkoutConfirmationRegistry';

const route = useRoute();
const loading = ref(true);
const invoiceData = ref<Record<string, unknown> | null>(null);

const invoiceId = computed(() => route.query.invoice_id as string || route.query.invoice as string || '');
const invoiceNumber = computed(() => (invoiceData.value?.invoice_number as string) || '');
const paymentStatus = computed(() => (invoiceData.value?.status as string)?.toLowerCase() || 'pending');
const totalAmount = computed(() => (invoiceData.value?.total_amount as string) || '');
const currency = computed(() => (invoiceData.value?.currency as string) || '');
const paymentDate = computed(() => {
  const date = invoiceData.value?.created_at as string;
  return date ? new Date(date).toLocaleString() : '';
});

const confirmationPlugins = computed(() => checkoutConfirmationRegistry.plugins.value);

const statusTitle = computed(() => {
  if (paymentStatus.value === 'paid') return '✓ Payment Successful';
  if (paymentStatus.value === 'pending') return '⏳ Payment Processing';
  if (paymentStatus.value === 'authorized') return '✓ Payment Authorized';
  return 'Payment Status';
});

const statusMessage = computed(() => {
  if (paymentStatus.value === 'paid') return 'Your payment has been processed successfully. Thank you!';
  if (paymentStatus.value === 'pending') return 'Your payment is being processed. This may take a moment.';
  if (paymentStatus.value === 'authorized') return 'Your payment has been authorized and will be charged upon completion.';
  return 'Your order has been received.';
});

onMounted(async () => {
  try {
    if (invoiceId.value) {
      const response = await api.get(`/user/invoices/${invoiceId.value}`) as Record<string, unknown>;
      invoiceData.value = (response.invoice as Record<string, unknown>) || response;
    }
  } catch {
    // Invoice may not be accessible yet — show pending state
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.public-checkout { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
.loading-state { text-align: center; padding: 60px 20px; color: #666; }
.spinner { width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.confirmation-banner { padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 24px; }
.confirmation-banner h1 { margin: 0 0 8px; font-size: 1.6rem; }
.confirmation-banner p { margin: 0; font-size: 1rem; }
.confirmation-banner--paid, .confirmation-banner--authorized { background: #dcfce7; color: #166534; }
.confirmation-banner--pending { background: #fef9c3; color: #854d0e; }
.confirmation-banner--failed, .confirmation-banner--cancelled { background: #fee2e2; color: #991b1b; }

.checkout-content { display: flex; flex-direction: column; gap: 20px; }
.card { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05); }
.card h2 { margin-bottom: 20px; color: #2c3e50; font-size: 1.2rem; border-bottom: 1px solid #eee; padding-bottom: 10px; }

.confirmation-grid { display: flex; flex-direction: column; }
.confirmation-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f8f9fa; }
.confirmation-label { color: #6b7280; font-weight: 500; font-size: 0.95rem; }
.confirmation-value { color: #2c3e50; font-size: 0.95rem; }
.confirmation-mono { font-family: monospace; font-size: 0.85rem; color: #6b7280; }

.status-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 500; text-transform: capitalize; }
.status-badge.paid, .status-badge.authorized { background: #dcfce7; color: #166534; }
.status-badge.pending { background: #fef9c3; color: #854d0e; }
.status-badge.failed { background: #fee2e2; color: #991b1b; }

.checkout-actions { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding-top: 10px; }
.btn { padding: 12px 24px; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; text-decoration: none; display: inline-block; }
.btn.primary { background-color: #3498db; color: white; }
.btn.primary:hover { background-color: #2980b9; }
.btn.secondary { background-color: #ecf0f1; color: #2c3e50; }
.btn.secondary:hover { background-color: #bdc3c7; }

@media (max-width: 600px) {
  .checkout-actions { flex-direction: column; }
  .btn { width: 100%; text-align: center; }
  .confirmation-row { flex-direction: column; gap: 4px; }
}
</style>
