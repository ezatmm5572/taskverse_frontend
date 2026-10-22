<script setup>
import { Check, AlertCircle, X } from 'lucide-vue-next'

defineProps({
  message: { type: String, default: '' },
  isError: { type: Boolean, default: false },
})
const emit = defineEmits(['dismiss'])
</script>

<template>
  <Transition name="fade">
    <div
      v-if="message"
      class="toast-message glass-panel"
      :class="{ 'toast-error': isError }"
      role="status"
      aria-live="polite"
    >
      <span class="toast-check">
        <AlertCircle v-if="isError" :size="16" />
        <Check v-else :size="16" />
      </span>
      <span>{{ message }}</span>
      <button class="icon-btn tiny-btn" aria-label="Dismiss notification" @click="emit('dismiss')">
        <X :size="14" />
      </button>
    </div>
  </Transition>
</template>
