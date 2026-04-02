<template>
  <div
    class="checkout-confirmation"
    data-testid="checkout-confirmation"
  >
    <!-- Loading -->
    <div
      v-if="loading"
      class="loading-state"
    >
      <div class="spinner" />
      <p>{{ t('checkout.confirmation.verifying') }}</p>
    </div>

    <template v-else>
      <!-- Status Banner -->
      <div
        class="confirmation-banner"
        :class="`confirmation-banner--${paymentStatus}`"
        data-testid="confirmation-banner"
      >
        <h1>{{ statusTitle }}</h1>
        <p>{{ statusMessage }}</p>
      </div>

      <!-- Invoice Details Card -->
      <div
        v-if="invoiceData"
        class="card"
        data-testid="invoice-details"
      >
        <h2>{{ t('checkout.confirmation.paymentDetails') }}</h2>
        <div class="confirmation-grid">
          <div class="confirmation-row">
            <span class="confirmation-label">{{ t('checkout.confirmation.invoiceNumber') }}</span>
            <span class="confirmation-value confirmation-mono">{{ invoiceNumber }}</span>
          </div>
          <div class="confirmation-row">
            <span class="confirmation-label">{{ t('checkout.confirmation.status') }}</span>
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
            <span class="confirmation-label">{{ t('checkout.confirmation.amount') }}</span>
            <span class="confirmation-value"><strong>{{ formatPrice(totalAmount, currency) }}</strong></span>
          </div>
          <div
            v-if="paymentDate"
            class="confirmation-row"
          >
            <span class="confirmation-label">{{ t('checkout.confirmation.date') }}</span>
            <span class="confirmation-value">{{ paymentDate }}</span>
          </div>
          <div
            v-if="paymentMethod"
            class="confirmation-row"
          >
            <span class="confirmation-label">{{ t('checkout.confirmation.paymentMethod') }}</span>
            <span class="confirmation-value">{{ paymentMethod }}</span>
          </div>
        </div>

        <!-- Line Items Table -->
        <div
          v-if="lineItems.length > 0"
          class="line-items"
        >
          <h3>{{ t('checkout.confirmation.items') }}</h3>
          <table class="line-items-table">
            <thead>
              <tr>
                <th>{{ t('checkout.confirmation.description') }}</th>
                <th>{{ t('checkout.confirmation.quantity') }}</th>
                <th>{{ t('checkout.confirmation.unitPrice') }}</th>
                <th>{{ t('checkout.confirmation.total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, index) in lineItems"
                :key="index"
                data-testid="line-item-row"
              >
                <td>{{ item.description }}</td>
                <td>{{ item.quantity }}</td>
                <td>{{ formatPrice(String(item.unit_price || 0), currency) }}</td>
                <td>{{ formatPrice(String(item.amount || 0), currency) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td
                  colspan="3"
                  class="total-label"
                >
                  {{ t('checkout.confirmation.total') }}
                </td>
                <td class="total-value">
                  <strong>{{ formatPrice(totalAmount, currency) }}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
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

      <!-- CMS page content with template variables replaced -->
      <!-- Admin edits this in CMS: buttons, support info, upsells, branding -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        v-if="renderedContent"
        class="cms-content"
        v-html="renderedContent"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, getCurrentInstance } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { checkoutConfirmationRegistry } from '@/registries/checkoutConfirmationRegistry';
import { useCmsStore } from '../cms/src/stores/useCmsStore';

// Use global i18n ($t) — useI18n() creates a local scope that misses plugin translations
const instance = getCurrentInstance();
const t = (key: string) => instance?.proxy?.$t(key) ?? key;

const route = useRoute();
const cmsStore = useCmsStore();
const loading = ref(true);
const invoiceData = ref<Record<string, unknown> | null>(null);

const invoiceId = computed(() => route.query.invoice_id as string || route.query.invoice as string || '');
const invoiceNumber = computed(() => (invoiceData.value?.invoice_number as string) || '');
const paymentStatus = computed(() => (invoiceData.value?.status as string)?.toLowerCase() || 'pending');
const totalAmount = computed(() => (invoiceData.value?.total_amount as string) || (invoiceData.value?.amount as string) || '');
const currency = computed(() => (invoiceData.value?.currency as string) || 'EUR');
const paymentMethod = computed(() => (invoiceData.value?.payment_method as string) || '');
const paymentDate = computed(() => {
  const date = (invoiceData.value?.paid_at as string) || (invoiceData.value?.invoiced_at as string);
  return date ? new Date(date).toLocaleString() : '';
});

const lineItems = computed(() => {
  const items = invoiceData.value?.line_items;
  return Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
});

const confirmationPlugins = computed(() => checkoutConfirmationRegistry.plugins.value);

const statusTitle = computed(() => {
  if (paymentStatus.value === 'paid') return 'Payment Successful';
  if (paymentStatus.value === 'pending') return 'Payment Processing';
  if (paymentStatus.value === 'authorized') return 'Payment Authorized';
  if (paymentStatus.value === 'failed') return 'Payment Failed';
  if (paymentStatus.value === 'cancelled') return 'Payment Cancelled';
  return 'Order Received';
});

const statusMessage = computed(() => {
  if (paymentStatus.value === 'paid') return 'Your payment has been processed successfully. Thank you for your order!';
  if (paymentStatus.value === 'pending') return 'Your payment is being processed. This may take a moment.';
  if (paymentStatus.value === 'authorized') return 'Your payment has been authorized and will be charged upon completion.';
  if (paymentStatus.value === 'failed') return 'Your payment could not be processed. Please try again.';
  if (paymentStatus.value === 'cancelled') return 'Your payment was cancelled.';
  return 'Your order has been received.';
});

function formatPrice(price: string | number, curr: string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return String(price);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr || 'EUR' }).format(num);
}

/**
 * Replace template variables in CMS page content.
 * Variables: {{invoice_number}}, {{total_amount}}, {{currency}}, {{status}},
 * {{payment_method}}, {{payment_date}}, {{user_email}}, {{line_items_html}}, etc.
 */
const renderedContent = computed(() => {
  const page = cmsStore.currentPage;
  if (!page) return '';

  let html = (page as Record<string, unknown>).content_html as string;
  if (!html) return '';

  const invoice = invoiceData.value || {};
  const variables: Record<string, string> = {
    invoice_number: (invoice.invoice_number as string) || '',
    invoice_id: invoiceId.value,
    status: paymentStatus.value,
    total_amount: totalAmount.value ? formatPrice(totalAmount.value, currency.value) : '',
    subtotal: invoice.subtotal ? formatPrice(invoice.subtotal as string, currency.value) : '',
    tax_amount: invoice.tax_amount ? formatPrice(invoice.tax_amount as string, currency.value) : '',
    currency: currency.value,
    payment_method: paymentMethod.value,
    payment_date: paymentDate.value,
    payment_ref: (invoice.payment_ref as string) || '',
    user_id: (invoice.user_id as string) || '',
    line_items_html: buildLineItemsHtml(),
  };

  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
  }

  return html;
});

function buildLineItemsHtml(): string {
  if (lineItems.value.length === 0) return '';
  let html = '<table class="line-items-table"><thead><tr><th>Description</th><th>Qty</th><th>Price</th></tr></thead><tbody>';
  for (const item of lineItems.value) {
    html += `<tr><td>${item.description || ''}</td><td>${item.quantity || 1}</td><td>${formatPrice(item.amount as string, currency.value)}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

onMounted(async () => {
  try {
    if (invoiceId.value) {
      const response = await api.get(`/user/invoices/${invoiceId.value}`) as Record<string, unknown>;
      invoiceData.value = (response.invoice as Record<string, unknown>) || response;

      // Clear shop cart on successful order confirmation
      localStorage.removeItem('vbwd_shop_cart');
    }
  } catch {
    // Invoice may not be accessible yet — show pending state
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.checkout-confirmation { max-width: 800px; margin: 0 auto; padding: 20px; overflow: hidden; }
.loading-state { text-align: center; padding: 60px 20px; color: #666; }
.spinner { width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.confirmation-banner { padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 24px; }
.confirmation-banner h1 { margin: 0 0 8px; font-size: 1.5rem; }
.confirmation-banner p { margin: 0; font-size: 0.95rem; }
.confirmation-banner--paid, .confirmation-banner--authorized { background: #dcfce7; color: #166534; }
.confirmation-banner--pending { background: #fef9c3; color: #854d0e; }
.confirmation-banner--failed, .confirmation-banner--cancelled { background: #fee2e2; color: #991b1b; }

.card { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05); margin-bottom: 20px; }
.card h2 { margin: 0 0 20px; color: #2c3e50; font-size: 1.15rem; border-bottom: 1px solid #eee; padding-bottom: 10px; }

.confirmation-grid { display: flex; flex-direction: column; }
.confirmation-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
.confirmation-label { color: #6b7280; font-weight: 500; font-size: 0.9375rem; }
.confirmation-value { color: #1f2937; font-size: 0.9375rem; }
.confirmation-mono { font-family: monospace; font-size: 0.85rem; color: #6b7280; }

.status-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; text-transform: capitalize; }
.status-badge.paid, .status-badge.authorized { background: #dcfce7; color: #166534; }
.status-badge.pending { background: #fef9c3; color: #854d0e; }
.status-badge.failed, .status-badge.cancelled { background: #fee2e2; color: #991b1b; }

.line-items { margin-top: 20px; overflow-x: auto; }
.line-items h3 { margin: 0 0 12px; font-size: 1rem; color: #374151; }
.line-items-table { width: 100%; border-collapse: collapse; }
.line-items-table th:first-child,
.line-items-table td:first-child { width: 50%; }
.line-items-table th { text-align: left; padding: 8px 12px; font-size: 0.8125rem; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
.line-items-table td { padding: 10px 12px; font-size: 0.9375rem; border-bottom: 1px solid #f3f4f6; }
.line-items-table tfoot td { border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 12px; }
.total-label { text-align: right; font-weight: 600; color: #374151; }
.total-value { font-size: 1.05rem; white-space: nowrap; }

.cms-content { margin-top: 20px; }

@media (max-width: 600px) {
  .confirmation-row { flex-direction: column; gap: 4px; }
  .line-items-table th:nth-child(3),
  .line-items-table td:nth-child(3) { display: none; }
}
</style>
