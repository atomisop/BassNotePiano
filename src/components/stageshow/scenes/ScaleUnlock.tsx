'use client'

import { Badge, Bar, Icon, LockScreen, Notification, Phone, Row, Stage, States, Text, Window, WALLPAPER, type Act } from '../kit'
import '../bnp-look.css'
import './scale.css'

// Classes page: the teacher opens the next scale. No cursor, it happens on the teacher's side. Scale 1 is finished, Scale 2
// waits, then flips to open and the phone gets the notice. The phone straddles the window's right edge over margin only.

type S = { open: boolean; notice: boolean }
const initial: S = { open: false, notice: false }
const POSTER: S = { open: true, notice: true }

async function script(a: Act<S>) {
  await a.wait(1800)
  await a.set({ open: true })
  await a.wait(900)
  await a.set({ notice: true })
  await a.wait(3800)
  await a.set({ ...initial })
  await a.wait(900)
}

function Tile({ tone, children }: { tone: 'done' | 'open' | 'wait'; children: React.ReactNode }) {
  return <span className="su-tile" data-tone={tone}>{children}</span>
}

export function ScaleUnlock() {
  return (
    <Stage
      width={760}
      height={440}
      compact={{ below: 600, width: 358, height: 560 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme="dark"
      className="bnp-look su"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Roadmap" sidebar={layout === 'wide' ? <Sidebar /> : undefined} sidebarWidth={140} className="su-window">
            <div className="su-main">
              <Text className="su-h">Your scales</Text>
              <div className="su-list">
                <Row
                  lead={<Tile tone="done"><Icon name="check" size={16} /></Tile>}
                  title="Scale 1"
                  subtitle="Checklist complete"
                  meta={<Badge tone="success">Done</Badge>}
                  className="su-row"
                />
                <Row
                  className="su-row su-row--focus"
                  data-open={s.open}
                  lead={
                    <Tile tone={s.open ? 'open' : 'wait'}>
                      <States value={s.open ? 'open' : 'wait'} states={{ wait: <Icon name="lock" filled size={16} />, open: <Icon name="play" filled size={16} /> }} />
                    </Tile>
                  }
                  title="Scale 2"
                  subtitle={
                    <States
                      value={s.open ? 'open' : 'wait'}
                      states={{ wait: <span>Waiting for your teacher</span>, open: <span className="su-open-text">Open, start when you are ready</span> }}
                      align="start"
                    />
                  }
                  meta={
                    <States
                      value={s.open ? 'open' : 'wait'}
                      states={{ wait: <Badge tone="neutral">Locked</Badge>, open: <Badge tone="accent">Unlocked</Badge> }}
                      align="end"
                    />
                  }
                />
                {[0, 1, 2].map((i) => (
                  <Row
                    key={i}
                    className="su-row su-row--fill"
                    lead={<Tile tone="wait"><Icon name="lock" filled size={16} /></Tile>}
                    title={<Bar w={i === 1 ? 52 : 64} h={7} tone={3} />}
                    subtitle={<Bar w={i === 2 ? 96 : 120} h={6} tone={2} />}
                    meta={<Bar w={46} h={20} r={10} tone={1} />}
                  />
                ))}
              </div>
            </div>
          </Window>

          <Phone width={232} frame="pro" dark wallpaper={WALLPAPER} className="su-phone">
            <LockScreen size="satellite" stack="top">
              <div className="su-notice" data-show={s.notice}>
                <Notification
                  icon={<img src="/logo-mark.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                  title="Scale 2 is open"
                  body="Your teacher approved your next scale."
                />
              </div>
            </LockScreen>
          </Phone>
        </>
      )}
    </Stage>
  )
}

function Sidebar() {
  return (
    <aside className="su-side">
      {[
        ['Home', 38],
        ['Lessons', 56],
        ['Roadmap', 0],
        ['Streak', 34],
      ].map(([label, w]) =>
        label === 'Roadmap' ? (
          <div key={label} className="su-nav" data-active>
            <Icon name="calendar" filled size={14} />
            <span>Roadmap</span>
          </div>
        ) : (
          <div key={label as string} className="su-nav">
            <Bar w={14} h={14} r={4} tone={2} />
            <Bar w={w as number} h={6} tone={2} />
          </div>
        ),
      )}
    </aside>
  )
}
