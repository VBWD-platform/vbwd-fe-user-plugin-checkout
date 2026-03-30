/**
 * Checkout Step Registry
 *
 * Plugins register additional checkout steps (shipping address, shipping method,
 * insurance, etc.) that are injected into the checkout flow dynamically.
 *
 * The core checkout always ends with the payment step. Plugin steps are inserted
 * before payment, sorted by their `order` value.
 *
 * Usage (from a plugin's install() hook):
 *   import { checkoutStepRegistry } from '../checkout/checkoutStepRegistry';
 *   checkoutStepRegistry.register({
 *     plugin: 'ecommerce',
 *     steps: [
 *       { id: 'shipping-address', label: 'Shipping', component: ShippingStep, order: 10, plugin: 'ecommerce' },
 *     ],
 *     cartSummary: CartLineItems,
 *     beforePayment: async () => { await blockStock(); },
 *   });
 */

import type { Component } from 'vue';

export interface CheckoutStep {
  /** Unique step identifier */
  id: string;
  /** Display label for step indicator */
  label: string;
  /** Vue component to render for this step */
  component: Component;
  /** Sort order — lower numbers come first (10, 20, 30...) */
  order: number;
  /** Owning plugin name */
  plugin: string;
  /** Optional validation before proceeding to next step */
  validate?: () => Promise<boolean>;
}

export interface CheckoutContext {
  /** Plugin name (used for unregister) */
  plugin: string;
  /** Checkout steps to inject */
  steps: CheckoutStep[];
  /** Optional: replaces default order summary with custom cart summary */
  cartSummary?: Component;
  /** Optional: called before payment is initiated */
  beforePayment?: () => Promise<void>;
  /** Optional: called after payment succeeds */
  afterPayment?: (invoiceId: string) => Promise<void>;
}

export class CheckoutStepRegistry {
  private contexts: Map<string, CheckoutContext> = new Map();

  /**
   * Register a plugin's checkout context (steps, summary, hooks).
   */
  register(context: CheckoutContext): void {
    this.contexts.set(context.plugin, context);
  }

  /**
   * Remove a plugin's checkout context.
   */
  unregister(plugin: string): void {
    this.contexts.delete(plugin);
  }

  /**
   * Get all steps from all plugins, sorted by order.
   */
  getSteps(): CheckoutStep[] {
    const allSteps: CheckoutStep[] = [];
    this.contexts.forEach((context) => {
      allSteps.push(...context.steps);
    });
    return allSteps.sort((a, b) => a.order - b.order);
  }

  /**
   * Check if any plugin has registered checkout steps.
   */
  hasSteps(): boolean {
    for (const context of this.contexts.values()) {
      if (context.steps.length > 0) return true;
    }
    return false;
  }

  /**
   * Get the custom cart summary component (last registered wins).
   */
  getCartSummary(): Component | null {
    let summary: Component | null = null;
    this.contexts.forEach((context) => {
      if (context.cartSummary) {
        summary = context.cartSummary;
      }
    });
    return summary;
  }

  /**
   * Get all beforePayment hooks.
   */
  getBeforePaymentHooks(): Array<() => Promise<void>> {
    const hooks: Array<() => Promise<void>> = [];
    this.contexts.forEach((context) => {
      if (context.beforePayment) {
        hooks.push(context.beforePayment);
      }
    });
    return hooks;
  }

  /**
   * Get all afterPayment hooks.
   */
  getAfterPaymentHooks(): Array<(invoiceId: string) => Promise<void>> {
    const hooks: Array<(invoiceId: string) => Promise<void>> = [];
    this.contexts.forEach((context) => {
      if (context.afterPayment) {
        hooks.push(context.afterPayment);
      }
    });
    return hooks;
  }

  /**
   * Clear all registered contexts (for testing).
   */
  clear(): void {
    this.contexts.clear();
  }
}

export const checkoutStepRegistry = new CheckoutStepRegistry();
