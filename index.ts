import type { IPlugin, IPlatformSDK } from 'vbwd-view-component';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ru from './locales/ru.json';
import th from './locales/th.json';
import zh from './locales/zh.json';

export const checkoutPlugin: IPlugin = {
  name: 'checkout',
  version: '1.0.0',
  description: 'Public checkout page for anonymous and authenticated users',
  _active: false,

  install(sdk: IPlatformSDK) {
    // Routes — keep noLayout for now, will migrate to CMS pages later
    sdk.addRoute({
      path: '/checkout',
      name: 'checkout-public',
      component: () => import('./PublicCheckoutView.vue') as Promise<{ default: unknown }>,
      meta: { requiresAuth: false, noLayout: true }
    });
    sdk.addRoute({
      path: '/checkout/confirmation',
      name: 'checkout-confirmation',
      component: () => import('../cms/src/views/CmsPage.vue'),
      props: { slug: 'checkout-confirmation' },
      meta: { requiresAuth: false, cmsLayout: true }
    });

    // Translations
    sdk.addTranslations('en', en);
    sdk.addTranslations('de', de);
    sdk.addTranslations('es', es);
    sdk.addTranslations('fr', fr);
    sdk.addTranslations('ja', ja);
    sdk.addTranslations('ru', ru);
    sdk.addTranslations('th', th);
    sdk.addTranslations('zh', zh);

    // Register CMS vue-component widgets
    import('../cms/src/registry/vueComponentRegistry')
      .then(({ registerCmsVueComponent }) => {
        Promise.all([
          import('./PublicCheckoutView.vue'),
          import('./CheckoutConfirmationView.vue'),
        ]).then(([checkoutForm, checkoutConfirmation]) => {
          registerCmsVueComponent('CheckoutForm', checkoutForm.default);
          registerCmsVueComponent('CheckoutConfirmation', checkoutConfirmation.default);
        });
      })
      .catch(() => {
        // CMS plugin not installed — skip widget registration
      });
  },

  activate(): void {
    (this as IPlugin & { _active: boolean })._active = true;
  },

  deactivate(): void {
    (this as IPlugin & { _active: boolean })._active = false;
  }
} as IPlugin & { _active: boolean };
