"use client"

import { useRef, type ReactNode } from "react"
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion"
import { BellRing, QrCode, Siren, ShieldCheck } from "lucide-react"

/**
 * Pointer + scroll parallax hero scene: the hospital photo and the floating
 * status pills sit on separate depth layers, drifting with the cursor and
 * rotating gently as the page scrolls — a physical, layered 3D feel with no
 * heavy WebGL dependency.
 */
export function HeroScene({ imageSrc, imageAlt }: { imageSrc: string; imageAlt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 90, damping: 18 })
  const sy = useSpring(my, { stiffness: 90, damping: 18 })

  // Scroll progress of the hero (0 → 1) drives a slow 3D rotation + drift.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const scrollSpin = useSpring(scrollYProgress, { stiffness: 120, damping: 26 })
  const sceneRotateX = useTransform(scrollSpin, [0, 1], [0, -7])
  const sceneY = useTransform(scrollSpin, [0, 1], [0, -26])

  const photoX = useTransform(sx, [-0.5, 0.5], [16, -16])
  const photoY = useTransform(sy, [-0.5, 0.5], [10, -10])
  const photoRotateY = useTransform(sx, [-0.5, 0.5], [4, -4])
  const pillsX = useTransform(sx, [-0.5, 0.5], [-30, 30])
  const pillsY = useTransform(sy, [-0.5, 0.5], [-20, 20])

  const pillVariants = {
    hidden: { opacity: 0, y: 22, z: -140 },
    show: (i: number) => ({
      opacity: 1, y: 0, z: 90,
      transition: { delay: 0.5 + i * 0.18, type: "spring" as const, stiffness: 160, damping: 18 },
    }),
  }

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
      <motion.div
        className="hero-scene"
        style={{ y: sceneY, rotateX: sceneRotateX, transformStyle: "preserve-3d" }}
      >
        <motion.div className="hero-photo" style={{ x: photoX, y: photoY, rotateY: photoRotateY }}>
          <img src={imageSrc} alt={imageAlt} />
          <div className="hero-photo-tag"><Siren size={14} /> Emergency-ready · 24/7</div>
        </motion.div>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`flow-pill flow-${["one", "two", "three"][i]}`}
            style={{ x: pillsX, y: pillsY }}
            variants={pillVariants}
            initial="hidden"
            animate="show"
            custom={i}
            whileHover={{ scale: 1.05, z: 120, transition: { type: "spring", stiffness: 260 } }}
          >
            {i === 0 && <span className="flow-icon teal"><QrCode size={15} /></span>}
            {i === 1 && <span className="flow-icon amber"><BellRing size={15} /></span>}
            {i === 2 && <span className="flow-icon"><ShieldCheck size={15} /></span>}
            <span>
              <small>{i === 0 ? "QR scan" : i === 1 ? "Automation" : "Access"}</small>
              <strong>{i === 0 ? "help is alerted" : i === 1 ? "contact alerted" : "logged & audited"}</strong>
            </span>
          </motion.div>
        ))}
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

/**
 * Scroll-into-view 3D reveal: children rise, unrotate and fade in as they
 * enter the viewport — the whole page breathes in 3D as you scroll.
 */
export function Reveal3D({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 36, rotateX: -6, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay, type: "spring", stiffness: 150, damping: 20 }}
      style={{ transformPerspective: 900 }}
    >
      {children}
    </motion.div>
  )
}
