<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Sun, Moon, Monitor } from 'lucide-vue-next'

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  }
})

// Options: 'dark', 'light', 'system'
const selectedTheme = ref(localStorage.getItem('taskverse-theme-preference') || 'dark')

function applyTheme(pref) {
  let effective = pref
  if (pref === 'system') {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    effective = isDark ? 'dark' : 'light'
  }
  document.documentElement.dataset.theme = effective
  localStorage.setItem('taskverse-theme', effective)
  localStorage.setItem('taskverse-theme-preference', pref)
  selectedTheme.value = pref
}

function selectTheme(mode) {
  applyTheme(mode)
}

let mediaQueryListener = null

onMounted(() => {
  applyTheme(selectedTheme.value)

  if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryListener = (e) => {
      if (selectedTheme.value === 'system') {
        const effective = e.matches ? 'dark' : 'light'
        document.documentElement.dataset.theme = effective
        localStorage.setItem('taskverse-theme', effective)
      }
    }
    mql.addEventListener('change', mediaQueryListener)
  }
})

onUnmounted(() => {
  if (mediaQueryListener && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaQueryListener)
  }
})
</script>

<template>
  <div class="theme-switcher-capsule" role="radiogroup" aria-label="Theme selection">
    <button
      type="button"
      class="theme-btn"
      :class="{ active: selectedTheme === 'light' }"
      :title="'Switch to Light Mode'"
      @click="selectTheme('light')"
    >
      <Sun :size="15" />
      <span v-if="!compact">Light</span>
    </button>
    <button
      type="button"
      class="theme-btn"
      :class="{ active: selectedTheme === 'dark' }"
      :title="'Switch to Dark Mode'"
      @click="selectTheme('dark')"
    >
      <Moon :size="15" />
      <span v-if="!compact">Dark</span>
    </button>
    <button
      type="button"
      class="theme-btn"
      :class="{ active: selectedTheme === 'system' }"
      :title="'System preference'"
      @click="selectTheme('system')"
    >
      <Monitor :size="15" />
      <span v-if="!compact">Auto</span>
    </button>
  </div>
</template>
