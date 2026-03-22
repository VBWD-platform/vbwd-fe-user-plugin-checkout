/**
 * Checkout Confirmation Registry
 *
 * Plugins can register a Vue component that will be rendered on the
 * checkout confirmation/thank-you page after payment. The component
 * receives the invoice data as a prop and can display plugin-specific
 * details (e.g., booking resource info, GHRM package access).
 *
 * This keeps the checkout plugin agnostic: it renders whatever components
 * are registered, with no knowledge of which plugin provided them.
 *
 * Usage (from another plugin's install() hook):
 *   import { checkoutConfirmationRegistry } from '../checkout/checkoutConfirmationRegistry';
 *   import BookingConfirmationDetails from './components/BookingConfirmationDetails.vue';
 *   checkoutConfirmationRegistry.register('booking', BookingConfirmationDetails);
 *
 * Usage (from another plugin's deactivate() hook):
 *   checkoutConfirmationRegistry.unregister('booking');
 */

import { ref, type Component } from 'vue';

interface ConfirmationPlugin {
  name: string;
  component: Component;
}

class CheckoutConfirmationRegistry {
  private readonly _plugins = ref<ConfirmationPlugin[]>([]);

  /** Register a component to render on the confirmation page. */
  register(name: string, component: Component): void {
    // Replace if already registered
    this._plugins.value = this._plugins.value.filter(p => p.name !== name);
    this._plugins.value.push({ name, component });
  }

  /** Remove a registered component. */
  unregister(name: string): void {
    this._plugins.value = this._plugins.value.filter(p => p.name !== name);
  }

  /** Reactive list of registered confirmation components. */
  readonly plugins = this._plugins;
}

export const checkoutConfirmationRegistry = new CheckoutConfirmationRegistry();
