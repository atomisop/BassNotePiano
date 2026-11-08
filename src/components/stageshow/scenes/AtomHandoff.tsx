'use client'

import { Avatar, Badge, Bubble, Button, Collapse, Icon, LockScreen, Notification, Phone, Stage, States, Stream, Text, Thread, Window, WALLPAPER, type Act } from '../kit'
import '../bnp-look.css'
import './atom.css'

// Atom hands a student to a person. The visitor reports a missing payment, Atom answers and offers the team, one tap
// connects, the header changes from Atom to the team, a person replies, and the phone gets the notice. The phone straddles the
// window's right edge over margin only; at phone width the chat itself is the payoff and the phone is left out.

type S = { step: number; words: number; notice: boolean }
const initial: S = { step: 0, words: 0, notice: false }
const POSTER: S = { step: 5, words: 99, notice: true }

const ASK = 'I paid but my class credits are not there.'
const REPLY = 'Sorry about that. I cannot see payments from here. Want me to connect you with our team? A real person can check right away.'
const WORDS = REPLY.split(' ').length
const ANSWER = 'Found it, Maya. Your 4 credits are added now.'

async function script(a: Act<S>) {
  await a.wait(900)
  await a.set({ step: 1 })
  await a.wait(900)
  await a.set({ step: 2 })
  for (let i = 1; i <= WORDS; i++) {
    await a.set({ words: i })
    await a.wait(70)
  }
  await a.wait(400)
  await a.set({ step: 3 })
  await a.wait(900)
  await a.move('talk')
  await a.wait(350)
  await a.click()
  await a.set({ step: 4 })
  await a.move('rest')
  await a.wait(1400)
  await a.set({ step: 5 })
  await a.wait(500)
  await a.set({ notice: true })
  await a.wait(3400)
  await a.wait(600)
  await a.set({ ...initial })
  await a.wait(600)
}

export function AtomHandoff() {
  return (
    <Stage
      width={760}
      height={440}
      compact={{ below: 600, width: 358, height: 560 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme="dark"
      cursor={{ at: { wide: { x: 474, y: 404 }, compact: { x: 322, y: 520 } }, style: 'arrow' }}
      className="bnp-look ah"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Ask Atom" className="ah-window">
            <div className="ah-main">
              <div className="ah-head">
                <States
                  value={s.step >= 4 ? 'team' : 'atom'}
                  align="start"
                  states={{
                    atom: (
                      <span className="ah-who">
                        <Avatar name="Atom" size={28} tone="accent" />
                        <span className="ah-name">Atom</span>
                        <Badge tone="neutral">AI assistant</Badge>
                      </span>
                    ),
                    team: (
                      <span className="ah-who">
                        <Avatar name="Bass Note" size={28} tone="success" />
                        <span className="ah-name">Our team</span>
                        <Badge tone="success" dot>Connected</Badge>
                      </span>
                    ),
                  }}
                />
              </div>

              <Thread app="chat" className="ah-thread">
                <Collapse open={s.step >= 1} reveal="drop" from="below">
                  <Bubble from="me">{ASK}</Bubble>
                </Collapse>
                <Collapse open={s.step >= 2} reveal="drop" from="below">
                  <Bubble from="them">
                    <Stream text={REPLY} count={s.words} />
                  </Bubble>
                </Collapse>
                <Collapse open={s.step >= 3} reveal="drop" from="below">
                  <div className="ah-offer">
                    <Button
                      data-target="talk"
                      data-cursor="pointer"
                      variant={s.step >= 4 ? 'secondary' : 'primary'}
                      size="medium"
                      icon={s.step >= 4 ? <Icon name="check" size={14} /> : undefined}
                    >
                      {s.step >= 4 ? 'Team notified' : 'Talk to our team'}
                    </Button>
                  </div>
                </Collapse>
                <Collapse open={s.step >= 5} reveal="drop" from="below">
                  <Bubble from="them">
                    <span className="ah-by">Our team</span>
                    <span className="ah-person">{ANSWER}</span>
                  </Bubble>
                </Collapse>
              </Thread>

              <div className="ah-composer">
                <Text className="ah-ph">{s.step >= 4 ? 'Message support…' : 'Ask Atom anything…'}</Text>
                <span className="ah-send"><Icon name="send" size={14} /></span>
              </div>
            </div>
          </Window>

          {layout === 'wide' && (
            <Phone width={232} frame="pro" dark wallpaper={WALLPAPER} className="ah-phone">
              <LockScreen size="satellite" stack="top">
                <div className="ah-notice" data-show={s.notice}>
                  <Notification
                    icon={<img src="/logo-mark.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                    title="Our team replied"
                    body="Found it, Maya. Your 4 credits are added now."
                  />
                </div>
              </LockScreen>
            </Phone>
          )}
          <span data-target="rest" className="ah-rest" />
        </>
      )}
    </Stage>
  )
}
