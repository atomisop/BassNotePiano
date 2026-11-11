'use client'

import { Badge, Collapse, Facepile, Icon, Roll, Segmented, Stage, Text, type Act } from '../kit'
import { DEFAULT_PRICING, OFFERED_PLAN_CADENCE, calculatePaymentPlanRate, type PricingConfig } from '@/lib/classCreditPricing'
import '../bnp-look.css'
import './pricing.css'

// Pricing page bento: one hero tile (pick a plan length, the price rolls, the discount appears), one object tile (a 28 day
// bill is exactly four class days) and one small tile (a group plan, 10 percent off each). Prices come from the pricing
// config, never typed here, so a price change on Admin > Pricing changes this picture too.

type S = { term: 0 | 1 | 2 }
const initial: S = { term: 0 }
const POSTER: S = { term: 2 }
const TERMS = ['MONTHLY', 'TERM_3', 'TERM_6'] as const
const LABELS = ['1 Month', '3 Months', '6 Months']

const money = (cents: number) => (cents / 100).toFixed(2)

async function script(a: Act<S>) {
  await a.wait(1100)
  await a.move('term-2')
  await a.wait(300)
  await a.click()
  await a.set({ term: 2 })
  await a.move('rest')
  await a.wait(3600)
  await a.move('term-0')
  await a.wait(300)
  await a.click()
  await a.set({ term: 0 })
  await a.move('rest')
  await a.wait(1400)
}

export function PricingBento({ pricing = DEFAULT_PRICING }: { pricing?: PricingConfig }) {
  const rates = TERMS.map((t) => calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, t, pricing))
  // The saving a person really gets: the price they pay against the 1 Month price. The configured rate (20%) is taken BEFORE the price
  // is rounded up to end in 4.99 or 9.99, so quoting the rate overstated it and disagreed with the plan cards above (18%).
  const off = rates.map((r) => Math.max(0, Math.round((1 - r.installmentAmountCents / rates[0].installmentAmountCents) * 100)))
  return (
    <Stage
      width={880}
      height={420}
      compact={{ below: 600, width: 358, height: 460 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme="dark"
      cursor={{ at: { wide: { x: 470, y: 330 }, compact: { x: 320, y: 346 } }, style: 'arrow' }}
      className="bnp-look pb"
    >
      {(s, _rect, layout) => (
        <>
          <section className="pb-tile pb-plan">
            <Text className="pb-eyebrow">Plan length</Text>
            <Segmented items={LABELS} value={s.term} targets={['term-0', 'term-1', 'term-2']} cursor="pointer" className="pb-seg" />
            <div className="pb-price">
              <span className="pb-dollar">$</span>
              <Roll className="pb-amount">{money(rates[s.term].installmentAmountCents)}</Roll>
              <span className="pb-per">every 28 days</span>
            </div>
            <div className="pb-meta">
              <Badge tone="accent" icon={<Icon name="check" size={12} />}>4 classes per bill</Badge>
              <Collapse open={off[s.term] > 0} reveal="drop" className="pb-off">
                <Badge tone="success">{off[s.term] || off[2]}% off</Badge>
              </Collapse>
            </div>
          </section>

          <section className="pb-tile pb-cycle">
            <Text className="pb-eyebrow">One bill</Text>
            <div className="pb-days" aria-hidden>
              {Array.from({ length: 28 }, (_, i) => (
                <span key={i} className="pb-day" data-class={i % 7 === 2 || undefined} />
              ))}
            </div>
            <Text className="pb-cap">28 days, exactly 4 classes</Text>
          </section>

          {layout === 'wide' && (
            <section className="pb-tile pb-group">
              <Text className="pb-eyebrow">Group plan</Text>
              <Facepile names={['Maya Tesfaye', 'Liya Bekele', 'Dawit Alemu']} size={36} overlap={10} gap={3} />
              <Text className="pb-cap">{`${Math.round(pricing.familyDiscountRate * 100)}% off each person`}</Text>
            </section>
          )}
          <span data-target="rest" className="pb-rest" />
        </>
      )}
    </Stage>
  )
}
