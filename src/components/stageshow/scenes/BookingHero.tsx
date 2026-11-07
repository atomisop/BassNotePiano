'use client'

import { Bar, Button, Collapse, Icon, LockScreen, Notification, Phone, Roll, Row, Stage, Text, Window, WALLPAPER, type Act } from '../kit'
import '../bnp-look.css'
import './booking.css'

// Home hero: a student books a Saturday class. One thing happens: the Book button becomes Booked, the credit badge rolls
// from 4 to 3, the class lands under Coming up, and a phone gets the notification. The phone straddles the window's right
// edge over margin, never over the slot list.

type S = { booked: boolean; notice: boolean }
const initial: S = { booked: false, notice: false }
const POSTER: S = { booked: true, notice: true }

async function script(a: Act<S>) {
  await a.wait(900)
  await a.move('slot-book')
  await a.wait(350)
  await a.click()
  await a.set({ booked: true })
  await a.wait(500)
  await a.wait(500)
  await a.set({ notice: true })
  await a.move('rest')
  await a.wait(3200)
  await a.wait(600)
  await a.set({ ...initial })
  await a.wait(500)
}

const SLOTS = [
  { day: 'Thu', time: '5:00 PM', filler: true },
  { day: 'Sat', time: '3:00 PM', target: true },
  { day: 'Sun', time: '11:00 AM', filler: true },
]

export function BookingHero() {
  return (
    <Stage
      width={760}
      height={440}
      compact={{ below: 600, width: 358, height: 560 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme="dark"
      cursor={{ at: { wide: { x: 474, y: 404 }, compact: { x: 322, y: 330 } }, style: 'arrow' }}
      className="bnp-look bh"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Lessons" sidebar={layout === 'wide' ? <Sidebar /> : undefined} sidebarWidth={140} className="bh-window">
            <div className="bh-main">
              <div className="bh-head">
                <Text className="bh-h">Book a class</Text>
                <div className="bh-credits">
                  <Icon name="bolt" filled size={14} />
                  <Roll className="bh-credit-n">{s.booked ? '3' : '4'}</Roll>
                  <span className="bh-credit-l">credits</span>
                </div>
              </div>

              <Collapse open={s.booked} reveal="drop">
                <div className="bh-up">
                  <Row
                    lead={<span className="bh-cal"><Icon name="calendar" filled size={16} /></span>}
                    title="Saturday, 3:00 PM"
                    subtitle="45 minutes on Discord"
                    meta={<span className="bh-pill">Booked</span>}
                  />
                </div>
              </Collapse>

              <div className="bh-list">
                {SLOTS.map((slot) => (
                  <div key={slot.day} className="bh-slot" data-target={slot.target ? 'slot' : undefined}>
                    {slot.filler ? (
                      <>
                        <Bar w={34} h={7} tone={3} />
                        <Bar w={58} h={7} tone={2} />
                        <Bar w={52} h={24} r={12} tone={1} style={{ marginLeft: 'auto' }} />
                      </>
                    ) : (
                      <>
                        <span className="bh-day">{slot.day}</span>
                        <span className="bh-time">{slot.time}</span>
                        <Button
                          data-target="slot-book"
                          data-cursor="pointer"
                          variant={s.booked ? 'secondary' : 'primary'}
                          size="medium"
                          icon={s.booked ? <Icon name="check" size={14} /> : undefined}
                          className="bh-book"
                        >
                          {s.booked ? 'Booked' : 'Book'}
                        </Button>
                      </>
                    )}
                  </div>
                ))}
                {[0, 1].map((i) => (
                  <div key={`f${i}`} className="bh-slot bh-slot--fill">
                    <Bar w={34} h={7} tone={2} />
                    <Bar w={i ? 46 : 62} h={7} tone={1} />
                    <Bar w={52} h={24} r={12} tone={1} style={{ marginLeft: 'auto' }} />
                  </div>
                ))}
              </div>
            </div>
          </Window>

          <Phone width={232} frame="pro" dark wallpaper={WALLPAPER} className="bh-phone">
            <LockScreen size="satellite" stack="top">
              <div className="bh-notice" data-show={s.notice}>
                <Notification
                  icon={<img src="/logo-mark.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                  title="Class booked"
                  body="Saturday at 3:00 PM on Discord. See you there."
                />
              </div>
            </LockScreen>
          </Phone>
          <span data-target="rest" className="bh-rest" />
        </>
      )}
    </Stage>
  )
}

function Sidebar() {
  return (
    <aside className="bh-side">
      {[
        ['Home', 38],
        ['Lessons', 0],
        ['Messages', 50],
        ['Streak', 34],
      ].map(([label, w], i) =>
        i === 1 ? (
          <div key={label} className="bh-nav" data-active>
            <Icon name="calendar" filled size={14} />
            <span>Lessons</span>
          </div>
        ) : (
          <div key={label as string} className="bh-nav">
            <Bar w={14} h={14} r={4} tone={2} />
            <Bar w={w as number} h={6} tone={2} />
          </div>
        ),
      )}
    </aside>
  )
}
