'use client'

import { Badge, Bar, Button, Icon, LockScreen, Notification, Phone, Roll, Row, Stage, States, Text, Window, WALLPAPER, type Act } from '../kit'
import '../bnp-look.css'
import './streak.css'

// Practice streak: the student finishes today's 10 minutes. The streak rolls 6 to 7, today's dot fills, and the phone gets the
// notice. The phone straddles the window's right edge over margin only; at phone width the streak screen is the payoff.

type S = { done: boolean; notice: boolean }
const initial: S = { done: false, notice: false }
const POSTER: S = { done: true, notice: true }
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

async function script(a: Act<S>) {
  await a.wait(1000)
  await a.move({ at: 'finish', x: 22, y: 8 })
  await a.wait(350)
  await a.click()
  await a.set({ done: true })
  await a.wait(1100)
  await a.set({ notice: true })
  await a.move('rest')
  await a.wait(3400)
  await a.wait(600)
  await a.set({ ...initial })
  await a.wait(600)
}

export function PracticeStreak() {
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
      className="bnp-look ps"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Streak" className="ps-window">
            <div className="ps-main">
              <Text className="ps-eyebrow">Daily practice</Text>
              <div className="ps-figure">
                <Icon name="bolt" filled size={36} />
                <Roll className="ps-n">{s.done ? '7' : '6'}</Roll>
                <span className="ps-l">day streak</span>
              </div>
              <div className="ps-week">
                {DAYS.map((d, i) => (
                  <div key={i} className="ps-day">
                    <span className="ps-dot" data-on={i < 6 || (i === 6 && s.done) || undefined} data-today={i === 6 || undefined}>
                      {(i < 6 || (i === 6 && s.done)) && <Icon name="check" size={14} />}
                    </span>
                    <span className="ps-dl">{d}</span>
                  </div>
                ))}
              </div>
              <div className="ps-card">
                <Row
                  lead={<span className="ps-tile"><Icon name="play" filled size={16} /></span>}
                  title="Finger practice"
                  subtitle="10 minutes today"
                  meta={
                    <States
                      value={s.done ? 'done' : 'todo'}
                      align="end"
                      states={{
                        todo: <Button data-target="finish" data-cursor="pointer" variant="primary" size="medium">Finish</Button>,
                        done: <Badge tone="success">Done</Badge>,
                      }}
                    />
                  }
                />
              </div>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="ps-fill" data-extra={i > 0 || undefined}>
                  <Bar w={46} h={7} tone={3} />
                  <Bar w={i === 1 ? 96 : 120} h={7} tone={2} />
                  <Bar w={52} h={24} r={12} tone={1} style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          </Window>

          {layout === 'wide' && (
            <Phone width={232} frame="pro" dark wallpaper={WALLPAPER} className="ps-phone">
              <LockScreen size="satellite" stack="top">
                <div className="ps-notice" data-show={s.notice}>
                  <Notification
                    icon={<img src="/logo-mark.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                    title="7 day streak"
                    body="You practiced every day this week. Keep it going."
                  />
                </div>
              </LockScreen>
            </Phone>
          )}
          <span data-target="rest" className="ps-rest" />
        </>
      )}
    </Stage>
  )
}
