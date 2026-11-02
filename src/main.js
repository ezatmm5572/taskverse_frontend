import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { startDomTranslate } from './services/domTranslate.js'

createApp(App).use(router).mount('#app')
startDomTranslate()

// Offline-capable app shell (production builds only, so dev HMR is never cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
