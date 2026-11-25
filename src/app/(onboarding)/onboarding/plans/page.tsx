'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { PINS_ENABLED, HIGHLIGHTS_ENABLED } from '@/lib/feature-flags'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence, animate } from 'framer-motion'
import { useAuth } from '@/context/auth-context'
import { createCheckout } from '@/lib/api/stripe'
import { trackBrowserEvent } from '@/lib/analytics/events'
import { TeamsTier, type CheckoutPlan } from '@/lib/api/billing'
import { ContactSalesModal } from '@/components/ContactSalesModal'
import { Button } from '@/components/ui/button'
import { InformationCircleIcon } from '@strange-huge/icons'
import { ONBOARDING_TONE_ROUTE, ONBOARDING_ACCOUNT_TYPE_ROUTE, ONBOARDING_PLANS_ROUTE } from '@/lib/routes'

const CANVAS_GRADIENT =
  'linear-gradient(180deg, var(--neutral-50) 3.76%, var(--neutral-100) 75%, var(--neutral-200) 116.79%)'

type Billing = 'monthly' | 'annual'
type TeamPlanId = CheckoutPlan

// ── Team tiers ────────────────────────────────────────────────────────────────

interface TeamTier {
  sliderLabel:  string
  monthlyPrice: string
  annualPrice:  string
  annualBilled: string
  planId:       TeamPlanId
}

const TEAM_TIERS: TeamTier[] = TeamsTier.all.map(tier => ({
  sliderLabel: `$${tier.price.toLocaleString()}`,
  monthlyPrice: `$${tier.price.toLocaleString()}`,
  annualPrice: `$${(tier.price * 0.75).toLocaleString()}`,
  annualBilled: `$${(tier.price * 9).toLocaleString()}/yr`,
  planId: tier.planId,
}))

// ── Individual tiers ──────────────────────────────────────────────────────────

interface IndividualTier {
  sliderLabel:  string
  monthlyPrice: string
  annualPrice:  string
  annualBilled: string
  creditsLabel: string
  planType:     string
}

// Credits mirror the backend grants (services/users/settings/plans.yaml, USD × 1000).
const INDIVIDUAL_TIERS: IndividualTier[] = [
  { sliderLabel: '$12',  monthlyPrice: '$12',  annualPrice: '$9',  annualBilled: '$108/yr',  creditsLabel: '4,000',  planType: 'individual_12'  },
  { sliderLabel: '$25',  monthlyPrice: '$25',  annualPrice: '$19', annualBilled: '$225/yr',  creditsLabel: '12,000', planType: 'individual_25'  },
  { sliderLabel: '$100', monthlyPrice: '$100', annualPrice: '$75', annualBilled: '$900/yr',  creditsLabel: '45,000', planType: 'individual_100' },
]

// ── Small shared components ───────────────────────────────────────────────────

function GreenDot() {
  return (
    <div style={{
      width: 8, height: 8,
      borderRadius: '50%',
      backgroundColor: 'var(--green-300)',
      flexShrink: 0,
      marginTop: 'var(--space-1-5)',
      boxShadow: '0px 1px 1.5px rgba(82,75,71,0.12), 0px 0px 0px 1px rgba(212, 212, 212,0.4), inset 0px 1px 0px color-mix(in srgb, var(--static-white) 61%, transparent), inset 0px -1px 0px rgba(106,98,93,0.05)',
    }} />
  )
}

function FeatureItem({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
      <GreenDot />
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-800)' }}>
        {label}
      </span>
    </div>
  )
}

// Individual uses the neutral/100 beige dot (per Figma)
function BeigeDot() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-0-5)', flexShrink: 0 }}>
      <div style={{
        width: 8, height: 8,
        borderRadius: '50%',
        backgroundColor: 'var(--neutral-100)',
        boxShadow: [
          '0px 1px 1.5px rgba(82,75,71,0.12)',
          '0px 0px 0px 1px rgba(212, 212, 212,0.4)',
          'inset 0px 1px 0px color-mix(in srgb, var(--static-white) 61%, transparent)',
          'inset 0px -1px 0px rgba(106,98,93,0.05)',
        ].join(', '),
      }} />
    </div>
  )
}

function IndFeatureItem({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <BeigeDot />
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-800)' }}>
        {label}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-code)',
      fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-small)',
      color: 'var(--neutral-500)', margin: '0 0 var(--space-1) 0',
    }}>
      {children}
    </p>
  )
}

function YellowBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: 'var(--space-0-5) var(--space-1-5)', borderRadius: 'var(--radius-sm)',
      backgroundColor: 'var(--yellow-100)', color: 'var(--yellow-700)',
      fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-small)', whiteSpace: 'nowrap',
      boxShadow: 'var(--color-tag-Yellow-shadow), var(--color-tag-Yellow-inner-shadow)',
    }}>
      {children}
    </span>
  )
}

// ── Billing toggle ─────────────────────────────────────────────────────────────

function BillingToggle({ billing, onChange }: { billing: Billing; onChange: (b: Billing) => void }) {
  const activeStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, var(--neutral-700) 0%, var(--neutral-900) 100%)',
    color: 'var(--neutral-50)',
    boxShadow: [
      '0px 0px 0px 1px black',
      '0px 1.091px 1.091px rgba(59,54,50,0.1)',
      '0px 1.455px 3.127px rgba(59,54,50,0.4)',
      'inset 0px 1px 0.364px var(--neutral-50-30)',
      'inset 0px -2.182px 0.364px #120c08',
      'inset 0px -2.545px 4px -2.182px var(--neutral-50-50)',
    ].join(', '),
  }
  const inactiveStyle: React.CSSProperties = { background: 'none', color: 'var(--neutral-500)', boxShadow: 'none' }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', padding: 'var(--space-0-5)', borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--neutral-50-50)',
      boxShadow: 'inset 0px -1px 0px color-mix(in srgb, var(--static-white) 90%, transparent), inset 0px 1px 0px var(--neutral-100), inset 0px 0px 4px rgba(229, 229, 229,0.5)',
    }}>
      <button type="button" onClick={() => onChange('monthly')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-1-5) var(--space-2-5) var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', transition: 'background var(--duration-fast), box-shadow var(--duration-fast)', ...(billing === 'monthly' ? activeStyle : inactiveStyle) }}>Monthly</button>
      <button type="button" onClick={() => onChange('annual')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-1-5) var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', transition: 'background var(--duration-fast), box-shadow var(--duration-fast)', ...(billing === 'annual' ? activeStyle : inactiveStyle) }}>Yearly</button>
    </div>
  )
}

// ── Slack logo ─────────────────────────────────────────────────────────────────

function SlackLogo() {
  return (
    <svg width="48" height="48" viewBox="0 0 54 54" fill="none" style={{ flexShrink: 0 }}>
      <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="var(--brand-slack-cyan)"/>
      <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="var(--brand-slack-green)"/>
      <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="var(--brand-slack-yellow)"/>
      <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.249m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.249a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" fill="var(--brand-slack-red)"/>
    </svg>
  )
}

// ── Token square icon (welcome gift card) ─────────────────────────────────────

function TokenSquare() {
  return (
    <Image
      alt=""
      src="/token-square.svg"
      width={56}
      height={56}
      style={{ flexShrink: 0, display: 'block' }}
    />
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, backgroundColor: 'var(--neutral-100)', width: '100%' }} />
}

// ── Animated number counter hook ──────────────────────────────────────────────

function useCountAnimation(target: number, duration = 0.45): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const animRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    if (displayRef.current === target) return
    animRef.current?.stop()
    const from = displayRef.current
    animRef.current = animate(from, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v: number) => {
        const rounded = Math.round(v)
        displayRef.current = rounded
        setDisplay(rounded)
      },
    })
    return () => { animRef.current?.stop() }
  }, [target, duration])

  return display
}

// ── Individual plan custom animated slider ────────────────────────────────────

function IndSlider({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackW, setTrackW] = useState(0)
  const THUMB = 10
  const count = INDIVIDUAL_TIERS.length
  const spring = { type: 'spring' as const, stiffness: 400, damping: 35 }

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setTrackW(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const usable = Math.max(0, trackW - THUMB)
  const thumbX = count > 1 ? (value / (count - 1)) * usable : 0
  const fillW  = thumbX + THUMB / 2

  return (
    <div ref={trackRef} style={{ position: 'relative', height: THUMB }}>
      {/* Track background */}
      <div style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 4, backgroundColor: 'var(--neutral-white)', borderRadius: 'var(--radius-xs)' }} />
      {/* Animated fill */}
      <motion.div
        animate={{ width: trackW > 0 ? fillW : 0 }}
        transition={spring}
        style={{ position: 'absolute', top: 3, left: 0, height: 4, backgroundColor: 'var(--neutral-800-50)', borderRadius: 'var(--radius-xs)' }}
      />
      {/* Animated thumb */}
      <motion.div
        animate={{ x: trackW > 0 ? thumbX : 0 }}
        transition={spring}
        style={{ position: 'absolute', top: 0, left: 0, width: THUMB, height: THUMB, borderRadius: '50%', backgroundColor: 'var(--neutral-white)', boxShadow: '0 1px 4px color-mix(in srgb, var(--static-black) 22%, transparent), 0 0 0 1px rgba(59,54,50,0.2)' }}
      />
      {/* Invisible native range — handles drag */}
      <input
        type="range" min={0} max={count - 1} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', margin: 0, width: '100%', height: '100%' }}
      />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPlansPage() {
  return (
    <React.Suspense fallback={
      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--neutral-50)' }} />
    }>
      <OnboardingPlansContent />
    </React.Suspense>
  )
}

function OnboardingPlansContent() {
  const { push, replace } = useRouter()
  const searchParams       = useSearchParams()
  const { logout }         = useAuth()

  // Extract URL params first so lazy state initializers can read them.
  // ?plan= and ?billing= are written by handleTeamPlan into the Stripe cancel_url
  // so the user's exact selection is restored when they hit "Back" on the Stripe page.
  const typeParam    = searchParams.get('type')
  const planParam    = searchParams.get('plan')
  const billingParam = searchParams.get('billing')

  const isTeam = true

  // Billing — lazy init restores from Stripe cancel URL if present
  const [billing, setBilling] = useState<Billing>(() =>
    billingParam === 'annual' ? 'annual' : 'monthly'
  )
  const [contactSalesOpen, setContactSalesOpen] = useState(false)

  // Team plan state — tier restored from Stripe cancel URL if present
  const [teamTierIndex, setTeamTierIndex] = useState(() => {
    if (planParam) {
      const idx = TEAM_TIERS.findIndex(t => t.planId === planParam)
      if (idx >= 0) return idx
    }
    return 0
  })
  const [teamSlideDir,  setTeamSlideDir]  = useState<1 | -1>(1)
  const [teamLoading,   setTeamLoading]   = useState(false)
  const [teamError,     setTeamError]     = useState<string | null>(null)

  // Individual plan state — tier restored from Stripe cancel URL if present
  const [indTierIndex, setIndTierIndex] = useState(() => {
    if (planParam) {
      const idx = INDIVIDUAL_TIERS.findIndex(t => t.planType === planParam)
      if (idx >= 0) return idx
    }
    return 0
  })
  const [indSlideDir,  setIndSlideDir]  = useState<1 | -1>(1)

  // Keep the URL in sync so the Stripe cancel_url always lands on the right variant
  useEffect(() => {
    const type = isTeam ? 'team' : 'individual'
    if (typeParam !== type) {
      replace(`${ONBOARDING_PLANS_ROUTE}?type=${type}`)
    }
  }, [isTeam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Team computed
  const teamTier    = TEAM_TIERS[teamTierIndex]!
  const teamFillPct = teamTierIndex === 0 ? 0 : Math.round((teamTierIndex / (TEAM_TIERS.length - 1)) * 100)
  const teamPrice   = billing === 'monthly' ? teamTier.monthlyPrice : teamTier.annualPrice
  const teamSliderBg = `linear-gradient(to right, var(--neutral-white-90) 0%, var(--neutral-white-90) ${teamFillPct}%, color-mix(in srgb, var(--static-white) 28%, transparent) ${teamFillPct}%, color-mix(in srgb, var(--static-white) 28%, transparent) 100%)`

  // Individual computed
  const indTier      = INDIVIDUAL_TIERS[indTierIndex]!
  const indPrice     = billing === 'monthly' ? indTier.monthlyPrice : indTier.annualPrice
  const indPriceNum  = parseInt(indPrice.replace(/[^0-9]/g, ''), 10)
  const animPriceNum = useCountAnimation(indPriceNum)

  // Batched setters — set direction + index in one render so exit animation gets the right dir
  const setIndTier  = (i: number) => { setIndSlideDir(i > indTierIndex ? 1 : -1); setIndTierIndex(i) }
  const setTeamTier = (i: number) => { setTeamSlideDir(i > teamTierIndex ? 1 : -1); setTeamTierIndex(i) }

  const ctaShadow = [
    '0px 0px 0px 1px black',
    '0px 1.091px 1.091px rgba(59,54,50,0.1)',
    '0px 1.455px 3.127px rgba(59,54,50,0.4)',
    'inset 0px 1px 0.364px var(--neutral-50-30)',
    'inset 0px -2.182px 0.364px #120c08',
    'inset 0px -2.545px 4px -2.182px var(--neutral-50-50)',
  ].join(', ')

  const handleTeamPlan = async () => {
    if (teamLoading) return
    setTeamLoading(true)
    setTeamError(null)
    try {
      const { checkout_url } = await createCheckout({ planId: teamTier.planId, billingInterval: billing })
      trackBrowserEvent('checkout_started', { to_plan: teamTier.planId, source: 'onboarding' })
      window.location.href = checkout_url
    } catch (err) {
      trackBrowserEvent('checkout_failed', { to_plan: teamTier.planId, source: 'onboarding' })
      setTeamError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setTeamLoading(false)
    }
  }

  const handleIndividualPlan = () => {
    push(ONBOARDING_TONE_ROUTE)
  }

  return (
    <>
      <style>{`
        .sv-team-slider {
          -webkit-appearance: none; appearance: none;
          height: 4px; border-radius: 2px; outline: none; cursor: pointer;
        }
        .sv-team-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--static-white); border: none; cursor: pointer;
          box-shadow: 0 1px 4px color-mix(in srgb, var(--static-black) 22%, transparent), 0 0 0 2px color-mix(in srgb, var(--static-white) 30%, transparent);
        }
        .sv-team-slider::-moz-range-thumb {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--static-white); border: none; cursor: pointer;
          box-shadow: 0 1px 4px color-mix(in srgb, var(--static-black) 22%, transparent);
        }
        .sv-ind-slider {
          -webkit-appearance: none; appearance: none;
          height: 4px; border-radius: 2px; outline: none; cursor: pointer;
        }
        .sv-ind-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--static-white); border: none; cursor: pointer;
          box-shadow: 0 1px 4px color-mix(in srgb, var(--static-black) 22%, transparent), 0 0 0 1px rgba(59,54,50,0.2);
        }
        .sv-ind-slider::-moz-range-thumb {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--static-white); border: none; cursor: pointer;
          box-shadow: 0 1px 4px color-mix(in srgb, var(--static-black) 22%, transparent);
        }
      `}</style>

      <div style={{
        minHeight: '100vh', width: '100%', background: CANVAS_GRADIENT,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'var(--space-9) var(--space-6) var(--space-10)', boxSizing: 'border-box', gap: 'var(--space-7)',
      }}>

        {/* Top bar */}
        <div style={{ width: '100%', maxWidth: 1060, display: 'flex', alignItems: 'center', justifyContent: 'space-evenly' }}>
          <Button variant="outline" size="sm" onClick={() => push(ONBOARDING_ACCOUNT_TYPE_ROUTE)} leftIcon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            Back
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <BillingToggle billing={billing} onChange={setBilling} />
            <YellowBadge>Save 25%</YellowBadge>
          </div>
          <Button variant="default" size="sm" onClick={() => void logout()} leftIcon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M13 3v10M6.5 10.5 3.5 8l3-2.5M3.5 8H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            Log out
          </Button>
        </div>

        {isTeam ? (
          /* ══════════════════════════════════════════════════════════════════
             TEAMS & ENTERPRISE VARIANT — Team card + Custom/Enterprise card
             ══════════════════════════════════════════════════════════════════ */
          <div style={{ display: 'flex', gap: 'var(--space-7)', width: '100%', maxWidth: 1060, alignItems: 'flex-start' }}>

            {/* Team card */}
            <div style={{ flex: '0 0 523px', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', backgroundColor: 'var(--neutral-white)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--neutral-200)', padding: 'var(--space-3)', boxShadow: '0px 1px 1px color-mix(in srgb, var(--static-black) 5%, transparent)', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--static-black)', margin: 0 }}>Team</h2>
                  <YellowBadge>Most popular</YellowBadge>
                </div>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
                  Shared credits across unlimited members. No per-seat fees.
                </p>
              </div>

              {/* Slack highlight */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4) var(--space-3) var(--space-3)', borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--neutral-100)', boxShadow: '0px 1.091px 1.091px rgba(59,54,50,0.05), 0px 1.455px 3.127px rgba(38,33,30,0.15), inset 0px -2.182px 0.364px var(--neutral-100)' }}>
                <SlackLogo />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-600)' }}>Team-exclusive</span>
                  <div>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body-lg)', lineHeight: 'var(--line-height-body)', color: 'var(--static-black)', margin: 0 }}>Souvenir Slack Manager</p>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-caption)', color: 'var(--neutral-600)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Bot in Slack, by @-mention.</p>
                  </div>
                </div>
              </div>

              {/* Volume pricing */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <div style={{ backgroundColor: 'var(--neutral-700)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', overflow: 'hidden' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-small)', color: 'var(--static-white)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Pick your team&apos;s volume</p>
                  <div style={{ overflow: 'hidden' }}>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={`team-price-${teamTierIndex}-${billing}`}
                        initial={{ opacity: 0, y: teamSlideDir * 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: teamSlideDir * -12 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ margin: 0, lineHeight: 0 }}
                      >
                        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-display)', lineHeight: 'var(--line-height-display)', color: 'var(--static-white)' }}>{teamPrice}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-100)' }}>/mo{billing === 'annual' && ` · billed ${teamTier.annualBilled}`}</span>
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <div style={{ position: 'relative', backgroundColor: 'var(--neutral-100)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-3)', width: '100%', boxSizing: 'border-box', boxShadow: '0px 1.091px 1.091px rgba(59,54,50,0.05), 0px 1.455px 3.127px rgba(38,33,30,0.15), inset 0px -2.182px 0.364px var(--neutral-100)', overflow: 'hidden' }}>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`team-credits-${teamTierIndex}`}
                        initial={{ opacity: 0, y: teamSlideDir * 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: teamSlideDir * -12 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}
                      >
                        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--static-black)' }}>{new TeamsTier(teamTier.planId, billing).credits.toLocaleString()}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-caption)', color: 'var(--neutral-600)' }}>credits / month</span>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <input type="range" min={0} max={TEAM_TIERS.length - 1} step={1} value={teamTierIndex} onChange={(e) => setTeamTier(Number(e.target.value))} className="sv-team-slider" style={{ display: 'block', width: '100%', padding: 0, background: teamSliderBg }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {TEAM_TIERS.map((t, i) => (
                        <button key={t.sliderLabel} type="button" style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-body)', fontWeight: i === teamTierIndex ? 600 : 400, fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: i === teamTierIndex ? 'var(--neutral-50)' : 'color-mix(in srgb, var(--static-white) 38%, transparent)', cursor: 'pointer' }} onClick={() => setTeamTier(i)}>
                          {t.sliderLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Team features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  <div style={{ display: 'flex', gap: 'var(--onboarding-plans-section-gap)', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <SectionLabel>Team collaboration</SectionLabel>
                      <FeatureItem label="Unlimited members" />
                      {(PINS_ENABLED || HIGHLIGHTS_ENABLED) && <FeatureItem label="Shared Pins &amp; Highlights" />}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-6)' }}>
                      <FeatureItem label="Shared AI assistants" />
                      <FeatureItem label="Shared project folders" />
                    </div>
                  </div>
                  <Divider />
                  <div style={{ display: 'flex', gap: 'var(--onboarding-plans-section-gap)', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <SectionLabel>Governance &amp; guardrails · org panel</SectionLabel>
                      <FeatureItem label="Data ownership &amp; scope" />
                      <FeatureItem label="Per-member credit caps" />
                      <FeatureItem label="Full audit trail" />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-6)' }}>
                      <FeatureItem label="Roles · Admin / Editor / Member" />
                      <FeatureItem label="Approval gates" />
                      <FeatureItem label="Slack &amp; Teams manager bot" />
                    </div>
                  </div>
                </div>
              </div>

              {teamError && <p role="alert" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body-sm)', color: 'var(--color-tag-Red-text,var(--red-400))', margin: 0 }}>{teamError}</p>}
              <button type="button" disabled={teamLoading} onClick={() => void handleTeamPlan()} style={{ width: '100%', padding: 'var(--space-1-5) var(--space-5) var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', cursor: teamLoading ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-50)', background: teamLoading ? 'var(--neutral-500)' : 'linear-gradient(180deg, var(--neutral-700) 0%, var(--neutral-900) 100%)', boxShadow: teamLoading ? 'none' : ctaShadow, transition: 'background var(--duration-fast)' }}>
                {teamLoading ? 'Setting up…' : 'Start a Team Workspace'}
              </button>
            </div>

            {/* Custom / Enterprise card */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', backgroundColor: 'var(--neutral-white)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--neutral-200)', padding: 'var(--space-3)', boxShadow: '0px 1px 1px color-mix(in srgb, var(--static-black) 5%, transparent)', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--static-black)', margin: 0 }}>Custom</h2>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>Usage billed after each monthly cycle at 1.15 × service cost. No base fee.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <div style={{ display: 'flex', gap: 'var(--onboarding-plans-pair-gap)', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <SectionLabel>Team collaboration</SectionLabel>
                    <FeatureItem label="$0 monthly base fee" />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-6)' }}>
                    <FeatureItem label="$0 base fee · pay for usage" />
                    <FeatureItem label="Usage at 1.15 × service cost" />
                  </div>
                </div>
                <Divider />
                <div style={{ display: 'flex', gap: 'var(--onboarding-plans-compact-gap)', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <SectionLabel>Enterprise security</SectionLabel>
                    <FeatureItem label="SSO &amp; SAML" />
                    <FeatureItem label="DPA &amp; SLA" />
                    <FeatureItem label="Slack &amp; Teams manager bot" />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-6)' }}>
                    <FeatureItem label="SCIM provisioning" />
                    <FeatureItem label="Data residency" />
                  </div>
                </div>
                <Divider />
                <div style={{ display: 'flex', gap: 'var(--onboarding-plans-section-gap)', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <SectionLabel>White-glove &amp; support</SectionLabel>
                    <FeatureItem label="Onboarding &amp; training" />
                    <FeatureItem label="Monthly strategy review" />
                    <FeatureItem label="Priority email support" />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-6)' }}>
                    <FeatureItem label="Dedicated success manager" />
                    <FeatureItem label="Learning workspace" />
                    <FeatureItem label="Online meeting support" />
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setContactSalesOpen(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1-5)', width: '100%', padding: 'var(--space-1-5) var(--space-5) var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', backgroundColor: 'var(--neutral-white)', color: 'var(--neutral-700)', fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', cursor: 'pointer', boxSizing: 'border-box', boxShadow: '0px 1.091px 1.091px rgba(59,54,50,0.05), 0px 1.455px 3.127px rgba(38,33,30,0.15), 0px 0px 0px 1px var(--neutral-100), inset 0px -2.182px 0.364px var(--neutral-100)' }}>
                Contact Sales
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2.5 8h11M9.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>

        ) : (
          /* ══════════════════════════════════════════════════════════════════
             INDIVIDUAL VARIANT — 2-column card: left = pricing, right = features
             ══════════════════════════════════════════════════════════════════ */
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: 1060 }}>
            <div style={{
              width: '100%', maxWidth: 860,
              display: 'flex', flexDirection: 'row',
              backgroundColor: 'var(--general-input,white)',
              borderRadius: 'var(--radius-2xl)',
              border: '1px solid var(--general-border,var(--neutral-200))',
              boxShadow: '0px 1px 1px color-mix(in srgb, var(--static-black) 5%, transparent)',
              boxSizing: 'border-box',
              padding: 'var(--space-4)',
            }}>

              {/* ── LEFT COLUMN: header + welcome gift + pricing slider + CTA ── */}
              <div style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingRight: 'var(--space-3)', justifyContent: 'space-between' }}>

                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--static-black)', margin: 0, whiteSpace: 'nowrap' }}>
                    Individual
                  </h2>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
                    For prosumers, creators, and solo operators.
                  </p>
                </div>

                {/* Welcome gift card */}
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 'var(--space-3) var(--space-4) var(--space-3) var(--space-3)', borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--neutral-100)', boxShadow: 'var(--onboarding-plans-card-shadow)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <TokenSquare />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                      <p style={{ fontFamily: 'var(--font-code)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-600)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Welcome gift
                      </p>
                      <div>
                        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body-lg)', lineHeight: 'var(--line-height-body)', color: 'var(--static-black)', margin: 0, whiteSpace: 'nowrap' }}>
                          1,000 free credits
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-caption)', color: 'var(--neutral-600)', margin: 0 }}>
                          No credit card required. Try every feature with real workloads before you pay.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-xl)', pointerEvents: 'none', boxShadow: 'inset 0px -2.182px 0.364px 0px var(--neutral-100)' }} />
                </div>

                {/* Volume pricing panel — flex: 1 fills remaining height */}
                <div style={{ flex: 1, minHeight: 0, backgroundColor: 'var(--neutral-100)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <p style={{ fontFamily: 'var(--font-code)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-600)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Pick your monthly credits
                  </p>

                  {/* Price — counter animation */}
                  <p style={{ margin: 0, lineHeight: 0 }}>
                    <span style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-display)', lineHeight: 'var(--line-height-display)', color: 'var(--static-black)' }}>${animPriceNum}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)' }}>/mo{billing === 'annual' ? ` billed annually (${indTier.annualBilled})` : ''}</span>
                  </p>

                  {/* Credits display — directional slide animation */}
                  <div style={{ backgroundColor: 'var(--neutral-100)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-2-5) var(--space-3)', boxSizing: 'border-box', boxShadow: '0px 1.091px 1.091px rgba(59,54,50,0.05), 0px 1.455px 3.127px rgba(38,33,30,0.15), inset 0px -2.182px 0.364px var(--neutral-100)', overflow: 'hidden' }}>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={indTierIndex}
                        initial={{ opacity: 0, y: indSlideDir * 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: indSlideDir * -12 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}
                      >
                        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--static-black)' }}>{indTier.creditsLabel}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-caption)', color: 'var(--neutral-600)' }}>credits / month</span>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Animated slider + tier buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
                    <IndSlider value={indTierIndex} onChange={setIndTier} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-1)' }}>
                      {INDIVIDUAL_TIERS.map((t, i) => {
                        const isActive = i === indTierIndex
                        const isAnnual = billing === 'annual'
                        const label    = isAnnual ? t.annualBilled.replace('/yr', '') : t.sliderLabel
                        return (
                          <Button
                            key={t.sliderLabel}
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setIndTier(i)}
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span
                                key={label}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.14, ease: 'easeOut' }}
                                style={isAnnual && !isActive ? { color: 'var(--yellow-700)' } : undefined}
                              >
                                {label}
                              </motion.span>
                            </AnimatePresence>
                          </Button>
                        )
                      })}
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-500)', textAlign: 'center', margin: 0 }}>
                      Click a plan above to preview its credit value.
                    </p>
                  </div>
                </div>

                {/* CTA + hint */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
                  <Button variant="secondary" fluid onClick={handleIndividualPlan}>
                    Start for free
                  </Button>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)' }}>
                    <InformationCircleIcon animated size={13} color="var(--neutral-400)" />
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-400)' }}>
                      No payment needed now — upgrade anytime inside the app.
                    </span>
                  </div>
                </div>
              </div>

              {/* Column separator */}
              <div style={{ width: 1, backgroundColor: 'var(--neutral-100)', flexShrink: 0, alignSelf: 'stretch' }} />

              {/* ── RIGHT COLUMN: feature sections ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingLeft: 'var(--space-3)' }}>

                {/* Memory & Organization */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <SectionLabel>Memory &amp; Organization</SectionLabel>
                  <IndFeatureItem label="Cross-model memory that compounds" />
                  {PINS_ENABLED && <IndFeatureItem label="Unlimited Pins" />}
                  <IndFeatureItem label="Project folders" />
                  {HIGHLIGHTS_ENABLED && <IndFeatureItem label="Highlights from any answer" />}
                </div>

                <Divider />

                {/* Your AI workforce */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <SectionLabel>Your AI workforce</SectionLabel>
                  <IndFeatureItem label="Unlimited AI Assistants" />
                  <IndFeatureItem label="Unlimited Tasks &amp; Automation" />
                  <IndFeatureItem label="Scheduled tasks &amp; triggers" />
                </div>

                <Divider />

                {/* Models & tools */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <SectionLabel>Models &amp; tools</SectionLabel>
                  <IndFeatureItem label="Every major AI model" />
                  <IndFeatureItem label="Auto-route or pick manually" />
                  <IndFeatureItem label="Model Compare side-by-side" />
                  <IndFeatureItem label="Unlimited web search" />
                  <IndFeatureItem label="250+ connectors" />
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {contactSalesOpen && <ContactSalesModal onClose={() => setContactSalesOpen(false)} />}
    </>
  )
}
