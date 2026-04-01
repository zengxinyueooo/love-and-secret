<template>
  <div v-if="show" class="magic-dust-container">
    <div
      v-for="i in 12"
      :key="i"
      class="dust-particle"
      :style="{
        left: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 0.5}s`,
        animationDuration: `${1 + Math.random()}s`
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  trigger: boolean
}>()

const show = ref(false)

watch(() => props.trigger, (newVal) => {
  if (newVal) {
    show.value = true
    setTimeout(() => {
      show.value = false
    }, 1500)
  }
}, { immediate: true })
</script>

<style scoped>
.magic-dust-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.dust-particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: radial-gradient(circle, rgba(74, 144, 226, 0.8) 0%, rgba(74, 144, 226, 0) 70%);
  border-radius: 50%;
  animation: dustFloat 1.5s ease-out forwards;
  box-shadow: 0 0 8px rgba(74, 144, 226, 0.6);
}

@keyframes dustFloat {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  50% {
    transform: translateY(-30px) translateX(var(--drift, 0px)) scale(1.2);
    opacity: 0.8;
  }
  100% {
    transform: translateY(-60px) translateX(var(--drift, 0px)) scale(0.3);
    opacity: 0;
  }
}

.dust-particle:nth-child(odd) {
  --drift: 20px;
}

.dust-particle:nth-child(even) {
  --drift: -20px;
}
</style>
