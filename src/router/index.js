import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: 'TaskVerse — Task & Team Management' } },
  { path: '/app', name: 'workspace', component: () => import('../views/WorkspaceView.vue'), meta: { title: 'Workspace — TaskVerse' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to) => (to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }),
})

router.afterEach((to) => {
  if (to.meta?.title) document.title = to.meta.title
})

export default router
