import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ChatView from '../views/ChatView.vue'
import CardGalleryView from '../views/CardGalleryView.vue'
import TimelineView from '../views/TimelineView.vue'
import ElementsView from '../views/ElementsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TraceView from '../views/TraceView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView
    },
    {
      path: '/cards',
      name: 'cards',
      component: CardGalleryView
    },
    {
      path: '/timeline',
      name: 'timeline',
      component: TimelineView
    },
    {
      path: '/elements',
      name: 'elements',
      component: ElementsView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    },
    {
      path: '/trace/:id?',
      name: 'trace',
      component: TraceView
    }
  ]
})

export default router
