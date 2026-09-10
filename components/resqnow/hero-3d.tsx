"use client"

import { useRef, type ReactNode } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { BellRing, QrCode, Siren, ShieldCheck } from "lucide-react"

/**
 * Pointer-parallax hero scene: the hospital photo and the floating status
 * pills sit on separate depth layers and drift with the cursor — the page
 * gains a physical, 3D feel without any heavy WebGL dependency.
 */
export function HeroScene({ imageSrc, imageAlt }: { imageSrc: string; imageAlt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 90, damping: 18 })
  const sy = useSpring(my, { stiffness: 90, damping: 18 })

  const sceneY = useTransform(sy, [-0.5, 0.5], [8, -8])
  const photoX = useTransform(sx, [-0.5, 0.5], [16, -16])
  const photoY = useTransform(sy, [-0.5, 0.5], [10, -10])
  const photoRotateY = useTransform(sx, [-0.5, 0.5], [3, -3])
  const pillsX = useTransform(sx, [-0.5, 0.5], [-26, 26])
  const pillsY = useTransform(sy, [-0.5, 0.5], [-16, 16])

  return (
    <div
      ref={ref}
      className="hero-visual hero-3d"
      onPointerMove={(event) => {
        const rect = ref.current?.getBoundingClientRect()
        if (!rect) return
        mx.set((event.clientX - rect.left) / rect.width - 0.5)
        my.set((event.clientY - rect.top) / rect.height - 0.5)
      }}
      onPointerLeave={() => { mx.set(0); my.set(0) }}
    >
      <motion.div className="hero-scene" style={{ y: sceneY, transformStyle: "preserve-3d" }}>
        <motion.div className="hero-photo" style={{ x: photoX, y: photoY, rotateY: photoRotateY }}>
          <img src={imageSrc} alt={imageAlt} />
          <div className="hero-photo-tag"><Siren size={14} /> Emergency-ready · 24/7</div>
        </motion.div>
        <motion.div className="flow-pill flow-one" style={{ x: pillsX, y: pillsY }}>
          <span className="flow-icon teal"><QrCode size={15} /></span>
          <span><small>QR scan</small><strong>help is alerted</strong></span>
        </motion.div>
        <motion.div className="flow-pill flow-two" style={{ x: pillsX, y: pillsY }}>
          <span className="flow-icon amber"><BellRing size={15} /></span>
          <span><small>Automation</small><strong>contact alerted</strong></span>
        </motion.div>
        <motion.div className="flow-pill flow-three" style={{ x: pillsX, y: pillsY }}>
          <span className="flow-icon"><ShieldCheck size={15} /></span>
          <span><small>Access</small><strong>logged &amp; audited</strong></span>
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Client tilt wrapper for landing cards (children stay server-rendered). */
export function LandingTilt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 220, damping: 20 })
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 220, damping: 20 })
  return (
    <motion.div
      ref={ref}
      className="tilt"
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(event) => {
        const rect = ref.current?.getBoundingClientRect()
        if (!rect) return
        mx.set((event.clientX - rect.left) / rect.width - 0.5)
        my.set((event.clientY - rect.top) / rect.height - 0.5)
      }}
      onPointerLeave={() => { mx.set(0); my.set(0) }}
    >
      {children}
    </motion.div>
  )
}
