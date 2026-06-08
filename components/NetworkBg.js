import { useEffect, useRef } from 'react'

// Canvas de fondo con red de estrellas:
// - Brillo heterogeneo (70% tenues, 25% medias, 5% brillantes)
// - Velocidades heterogeneas (75% lentas, 18% medias, 7% rapidas)
// - Twinkle sutil en medias/brillantes
// - Estrellas fugaces cada 7-13 segundos
// - Conexiones discretas entre estrellas medias/brillantes cercanas
export default function NetworkBg() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let w = 0, h = 0, dpr = 1
    let stars = []
    let shootingStars = []
    let lastShootTime = 0
    let nextShootDelay = 6000 + Math.random() * 6000
    let animId = null

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initStars()
    }

    const initStars = () => {
      const count = Math.min(160, Math.floor((w * h) / 14000))
      stars = []
      for (let i = 0; i < count; i++) {
        const r = Math.random()

        // Velocidades heterogeneas
        let speedMultiplier
        const vRand = Math.random()
        if (vRand < 0.75) speedMultiplier = 1
        else if (vRand < 0.93) speedMultiplier = 2.2
        else speedMultiplier = 4

        // Tier de brillo
        let tier, maxBright, twinkleAmp, twinkleSpeed, radius
        if (r < 0.70) {
          tier = 'dim'
          maxBright = 0.25 + Math.random() * 0.15
          twinkleAmp = 0
          twinkleSpeed = 0
          radius = 0.5 + Math.random() * 0.4
        } else if (r < 0.95) {
          tier = 'mid'
          maxBright = 0.45 + Math.random() * 0.2
          twinkleAmp = 0.1 + Math.random() * 0.1
          twinkleSpeed = 0.4 + Math.random() * 0.6
          radius = 0.8 + Math.random() * 0.5
        } else {
          tier = 'bright'
          maxBright = 0.75 + Math.random() * 0.2
          twinkleAmp = 0.25 + Math.random() * 0.15
          twinkleSpeed = 0.6 + Math.random() * 0.8
          radius = 1.3 + Math.random() * 0.7
        }

        const baseSpeed = 0.08 * speedMultiplier
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * baseSpeed,
          vy: (Math.random() - 0.5) * baseSpeed,
          r: radius,
          tier,
          maxBright,
          twinkleAmp,
          twinkleSpeed,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.7 ? 'white' : 'blue'
        })
      }
    }

    const spawnShootingStar = () => {
      const side = Math.floor(Math.random() * 4)
      let x, y, angle
      if (side === 0) {
        x = Math.random() * w; y = -20
        angle = Math.PI * 0.25 + Math.random() * Math.PI * 0.5
      } else if (side === 1) {
        x = w + 20; y = Math.random() * h * 0.6
        angle = Math.PI * 0.75 + Math.random() * Math.PI * 0.3
      } else if (side === 2) {
        x = -20; y = Math.random() * h * 0.6
        angle = Math.random() * Math.PI * 0.3 + Math.PI * 0.1
      } else {
        x = Math.random() * w * 0.5; y = -20
        angle = Math.PI * 0.35 + Math.random() * Math.PI * 0.3
      }
      const speed = 8 + Math.random() * 4
      shootingStars.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 60 + Math.random() * 30,
        trail: []
      })
    }

    const draw = (ts) => {
      // Trail fade para que las fugaces dejen estela sutil
      ctx.fillStyle = 'rgba(4, 5, 10, 0.28)'
      ctx.fillRect(0, 0, w, h)

      const t = ts / 1000

      // Conexiones entre estrellas medias/brillantes
      for (let i = 0; i < stars.length; i++) {
        const s1 = stars[i]
        if (s1.tier === 'dim') continue
        for (let j = i + 1; j < stars.length; j++) {
          const s2 = stars[j]
          if (s2.tier === 'dim') continue
          const dx = s1.x - s2.x
          const dy = s1.y - s2.y
          const d2 = dx * dx + dy * dy
          if (d2 < 130 * 130) {
            const d = Math.sqrt(d2)
            const alpha = (1 - d / 130) * 0.09
            ctx.strokeStyle = `rgba(30, 144, 255, ${alpha})`
            ctx.lineWidth = 0.4
            ctx.beginPath()
            ctx.moveTo(s1.x, s1.y)
            ctx.lineTo(s2.x, s2.y)
            ctx.stroke()
          }
        }
      }

      // Estrellas
      stars.forEach(s => {
        s.x += s.vx
        s.y += s.vy
        if (s.x < 0) s.x = w
        else if (s.x > w) s.x = 0
        if (s.y < 0) s.y = h
        else if (s.y > h) s.y = 0

        const twinkle = s.twinkleAmp > 0
          ? Math.sin(t * s.twinkleSpeed + s.phase) * s.twinkleAmp
          : 0
        const brightness = Math.max(0.05, s.maxBright + twinkle)

        if (s.tier === 'bright') {
          const glowRadius = s.r * 6
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowRadius)
          const coreColor = s.hue === 'blue' ? '30,144,255' : '200,220,255'
          g.addColorStop(0, `rgba(${coreColor}, ${brightness * 0.5})`)
          g.addColorStop(0.4, `rgba(${coreColor}, ${brightness * 0.15})`)
          g.addColorStop(1, `rgba(${coreColor}, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(s.x, s.y, glowRadius, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
        } else if (s.tier === 'mid') {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3)
          const color = s.hue === 'blue' ? '30,144,255' : '220,230,255'
          g.addColorStop(0, `rgba(${color}, ${brightness})`)
          g.addColorStop(1, `rgba(${color}, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = `rgba(200, 220, 255, ${brightness})`
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // Spawn de fugaces
      if (ts - lastShootTime > nextShootDelay) {
        spawnShootingStar()
        lastShootTime = ts
        nextShootDelay = 7000 + Math.random() * 6000
      }

      // Dibujar fugaces
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i]
        s.trail.push({ x: s.x, y: s.y })
        if (s.trail.length > 18) s.trail.shift()
        s.x += s.vx
        s.y += s.vy
        s.life++

        for (let k = 0; k < s.trail.length; k++) {
          const p = s.trail[k]
          const alpha = (k / s.trail.length) * (1 - s.life / s.maxLife) * 0.9
          const radius = (k / s.trail.length) * 1.6 + 0.2
          ctx.fillStyle = `rgba(220, 235, 255, ${alpha})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
          ctx.fill()
        }
        const headAlpha = Math.max(0, 1 - s.life / s.maxLife)
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 8)
        g.addColorStop(0, `rgba(255,255,255,${headAlpha})`)
        g.addColorStop(0.5, `rgba(180, 210, 255, ${headAlpha * 0.4})`)
        g.addColorStop(1, `rgba(30, 144, 255, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(s.x, s.y, 8, 0, Math.PI * 2)
        ctx.fill()

        if (s.life > s.maxLife || s.x < -50 || s.x > w + 50 || s.y < -50 || s.y > h + 50) {
          shootingStars.splice(i, 1)
        }
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      if (animId) cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  )
}
