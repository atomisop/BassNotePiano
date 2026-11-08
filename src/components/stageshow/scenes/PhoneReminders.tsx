'use client'

import { Bar, Icon, LockScreen, Notification, Phone, Row, Stage, Text, Toggle, Window, WALLPAPER, type Act } from '../kit'
import '../bnp-look.css'
import './reminders.css'

// Settings tutorial: "Reminders on your phone". The student flips the switch and a class reminder reaches their phone. The
// phone straddles the window's right edge over margin only; at phone width the settings screen is the payoff.

type S = { on: boolean; notice: boolean }
const initial: S = { on: false, notice: false }
const POSTER: S = { on: true, notice: true }

async function script(a: Act<S>) {
  await a.wait(1000)
  await a.move('switch')
  await a.wait(350)
  await a.click()
  await a.set({ on: true })
  await a.wait(1100)
  await a.set({ notice: true })
  await a.move('rest')
  await a.wait(3400)
  await a.wait(600)
  await a.set({ ...initial })
  await a.wait(600)
}

export function PhoneReminders() {
  return (
    <Stage
      width={760}
      height={440}
      compact={{ below: 600, width: 358, height: 560 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme="dark"
      cursor={{ at: { wide: { x: 474, y: 404 }, compact: { x: 322, y: 470 } }, style: 'arrow' }}
      className="bnp-look rm"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Settings" className="rm-window">
            <div className="rm-main">
              <Text className="rm-h">Reminders on your phone</Text>
              <div className="rm-card" data-on={s.on || undefined}>
                <Row
                  lead={<span className="rm-tile"><Icon name="bell" filled size={16} /></span>}
                  title="Class reminders"
                  subtitle="Before every class"
                >
                  <Toggle on={s.on} data-target="switch" data-cursor="pointer" />
                </Row>
              </div>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="rm-fill" data-extra={i > 2 || undefined}>
                  <Bar w={i === 1 ? 52 : 40} h={7} tone={3} />
                  <Bar w={i === 2 ? 96 : 120} h={7} tone={2} />
                  <Bar w={44} h={24} r={12} tone={1} style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          </Window>

          {layout === 'wide' && (
            <Phone width={232} frame="pro" dark wallpaper={WALLPAPER} className="rm-phone">
              <LockScreen size="satellite" stack="top">
                <div className="rm-notice" data-show={s.notice}>
                  <Notification
                    icon={<img src="/logo-mark.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                    title="Class in 1 hour"
                    body="Saturday at 3:00 PM on Discord. See you there."
                  />
                </div>
              </LockScreen>
            </Phone>
          )}
          <span data-target="rest" className="rm-rest" />
        </>
      )}
    </Stage>
  )
}
