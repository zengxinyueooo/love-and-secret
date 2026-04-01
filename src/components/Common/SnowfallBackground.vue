<template>
  <canvas ref="canvasRef" class="fixed inset-0 pointer-events-none z-0" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationId: number | null = null

interface Snowflake {
  x: number
  y: number
  radius: number
  speed: number
  drift: number
}

const snowflakes: Snowflake[] = []

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 设置canvas大小
  const resizeCanvas = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  // 创建雪花
  const createSnowflakes = () => {
    const count = Math.floor((canvas.width * canvas.height) / 15000)
    for (let i = 0; i < count; i++) {
      snowflakes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 3 + 1,
        speed: Math.random() * 1 + 0.5,
        drift: Math.random() * 0.5 - 0.25
      })
    }
  }
  createSnowflakes()

  // 动画循环
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 绘制雪花
    ctx.fillStyle = 'rgba(74, 144, 226, 0.6)'
    ctx.beginPath()

    snowflakes.forEach((flake) => {
      ctx.moveTo(flake.x, flake.y)
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2)

      // 更新位置
      flake.y += flake.speed
      flake.x += flake.drift

      // 重置位置
      if (flake.y > canvas.height) {
        flake.y = -10
        flake.x = Math.random() * canvas.width
      }
      if (flake.x > canvas.width) {
        flake.x = 0
      } else if (flake.x < 0) {
        flake.x = canvas.width
      }
    })

    ctx.fill()
    animationId = requestAnimationFrame(animate)
  }

  animate()

  // 清理
  onUnmounted(() => {
    window.removeEventListener('resize', resizeCanvas)
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
  })
})
</script>
