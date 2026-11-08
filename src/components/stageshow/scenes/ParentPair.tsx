'use client'

import { Avatar, Badge, Bar, Button, Icon, LockScreen, Notification, Phone, Roll, Row, Stage, States, Text, Window, WALLPAPER, type Act } from '../kit'
import '../bnp-look.css'
import './parent.css'

// Parent mode: a parent moves their child's class from the parent screen and the child's phone is told. One thing happens:
// Saturday becomes Sunday on the parent's row, then the notice reaches the child. The phone straddles the window's right edge
// over margin only; at phone width the parent's screen is the payoff and the phone is left out.

type S = { moved: boolean; notice: boolean }
const initial: S = { moved: false, notice: false }
const POSTER: S = { moved: true, notice: true }

async function script(a: Act<S>) {
  await a.wait(1000)
  await a.move('move')
  await a.wait(350)
  await a.click()
  await a.set({ moved: true })
  await a.wait(1100)
  await a.set({ notice: true })
  await a.move('rest')
  await a.wait(3400)
  await a.wait(600)
  await a.set({ ...initial })
  await a.wait(600)
}

export function ParentPair() {
  return (
    <Stage
      width={760}
      height={440}
      compact={{ below: 600, width: 358, height: 560 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme="dark"
      cursor={{ at: { wide: { x: 474, y: 404 }, compact: { x: 322, y: 420 } }, style: 'arrow' }}
      className="bnp-look pp"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Parent" className="pp-window">
            <div className="pp-main">
              <div className="pp-head">
                <Avatar name="Liya Bekele" size={36} tone="accent" />
                <div className="pp-who">
                  <Text className="pp-name">Liya</Text>
                  <Text className="pp-sub">Next class</Text>
                </div>
                <Badge tone="accent">Parent mode</Badge>
              </div>

              <div className="pp-card">
                <Row
                  lead={<span className="pp-cal"><Icon name="calendar" filled size={16} /></span>}
                  title={<Roll>{s.moved ? 'Sunday, 11:00 AM' : 'Saturday, 3:00 PM'}</Roll>}
                  subtitle="45 minutes on Discord"
                  meta={
                    <States
                      value={s.moved ? 'done' : 'move'}
                      align="end"
                      states={{
                        move: (
                          <Button data-target="move" data-cursor="pointer" variant="primary" size="medium">
                            Move
                          </Button>
                        ),
                        done: (
                          <Button variant="secondary" size="medium" icon={<Icon name="check" size={14} />}>
                            Moved
                          </Button>
                        ),
                      }}
                    />
                  }
                />
              </div>

              <div className="pp-list">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="pp-fill" data-extra={i > 2 || undefined}>
                    <Bar w={i === 1 ? 52 : 40} h={7} tone={3} />
                    <Bar w={i === 2 ? 96 : 120} h={7} tone={2} />
                    <Bar w={52} h={24} r={12} tone={1} style={{ marginLeft: 'auto' }} />
                  </div>
                ))}
              </div>
            </div>
          </Window>

          {layout === 'wide' && (
            <Phone width={232} frame="pro" dark wallpaper={WALLPAPER} className="pp-phone">
              <LockScreen size="satellite" stack="top">
                <div className="pp-notice" data-show={s.notice}>
                  <Notification
                    icon={<img src="/logo-mark.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                    title="Class moved"
                    body="Your parent moved Saturday 3:00 PM to Sunday 11:00 AM."
                  />
                </div>
              </LockScreen>
            </Phone>
          )}
          <span data-target="rest" className="pp-rest" />
        </>
      )}
    </Stage>
  )
}
