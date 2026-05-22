onScroll

Search

[Events](https://animejs.com/documentation/events "Events")

[Since 4.0.0](https://github.com/juliangarnier/anime/releases/tag/v4.0.0)

# [onScroll](https://animejs.com/documentation/events/onscroll "onScroll")

## [Triggers and synchronises Timer, Animation and Timeline instances on scroll.](https://animejs.com/documentation/events/onscroll/\#triggers-and-synchronises-timer-animation-and-timeline-instances-on-scroll)

ScrollObservers are created with the `onScroll()` function and can be directly declared in the [`autoplay parameter`](https://animejs.com/documentation/animation/animation-playback-settings/autoplay "autoplay parameter").

```js
import { onScroll, animate } from 'animejs';

animate(targets, { x: 100, autoplay: onScroll(parameters) });




```

The `onScroll()` method can be imported directly from the main `'animejs'` module:

```js
import { onScroll } from 'animejs';

onScroll();




```

Or imported as a standalone module from the `'animejs/events'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { onScroll } from 'animejs/events';




```

## [Parameters](https://animejs.com/documentation/events/onscroll/\#parameters)

| Name | Accepts |
| --- | --- |
| parameters | An `Object` of [ScrollObserver settings](https://animejs.com/documentation/events/onscroll/scrollobserver-settings "ScrollObserver settings"), [ScrollObserver thresholds](https://animejs.com/documentation/events/onscroll/scrollobserver-thresholds "ScrollObserver thresholds"), [ScrollObserver sync modes](https://animejs.com/documentation/events/onscroll/scrollobserver-synchronisation-modes "ScrollObserver sync modes") and [ScrollObserver callbacks](https://animejs.com/documentation/events/onscroll/scrollobserver-callbacks "ScrollObserver callbacks") |

## [Returns](https://animejs.com/documentation/events/onscroll/\#returns)

`ScrollObserver`

```javascript
import { animate, createTimer, createTimeline , utils, onScroll } from 'animejs';

const [ container ] = utils.$('.scroll-container');
const debug = true;

// Animation

animate('.square', {
  x: '15rem',
  rotate: '1turn',
  duration: 2000,
  alternate: true,
  loop: true,
  autoplay: onScroll({ container, debug })
});

// Timer

const [ $timer ] = utils.$('.timer');

createTimer({
  duration: 2000,
  alternate: true,
  loop: true,
  onUpdate: self => {
    $timer.innerHTML = self.iterationCurrentTime
  },
  autoplay: onScroll({
    target: $timer.parentNode,
    container,
    debug
  })
});

// Timeline

const circles = utils.$('.circle');

createTimeline({
  alternate: true,
  loop: true,
  autoplay: onScroll({
    target: circles[0],
    container,
    debug
  })
})
.add(circles[2], { x: '9rem' })
.add(circles[1], { x: '9rem' })
.add(circles[0], { x: '9rem' });




```

```html
<div class="scroll-container scroll-y">
  <div class="scroll-content grid square-grid">
    <div class="scroll-section padded">
      <div class="large centered row">
        <div class="label">scroll down</div>
      </div>
    </div>
    <div class="scroll-section padded">
      <div class="large row">
        <div class="square"></div>
      </div>
    </div>
    <div class="scroll-section padded">
      <div class="large centered row">
        <pre class="large log row">
          <span class="label">timer</span>
          <span class="timer value lcd">0</span>
        </pre>
      </div>
    </div>
    <div class="scroll-section padded">
      <div class="large row">
        <div class="circle"></div>
        <div class="circle"></div>
        <div class="circle"></div>
      </div>
    </div>
  </div>
</div>




```

```css
#scroll-auto-play-on-scroll pre {
  left: 3rem;
  width: 12rem;
}

#scroll-auto-play-on-scroll .circle {
  margin: 0;
}




```

**In this section**

- [Settings](https://animejs.com/documentation/events/onscroll/scrollobserver-settings "ScrollObserver settings")
- [Thresholds](https://animejs.com/documentation/events/onscroll/scrollobserver-thresholds "ScrollObserver thresholds")
- [Synchronisation modes](https://animejs.com/documentation/events/onscroll/scrollobserver-synchronisation-modes "ScrollObserver synchronisation modes")
- [Callbacks](https://animejs.com/documentation/events/onscroll/scrollobserver-callbacks "ScrollObserver callbacks")
- [Methods](https://animejs.com/documentation/events/onscroll/scrollobserver-methods "ScrollObserver methods")
- [Properties](https://animejs.com/documentation/events/onscroll/scrollobserver-properties "ScrollObserver properties")

**Previous** **Next**

- [Events](https://animejs.com/documentation/events "Events")
- [ScrollObserver settings](https://animejs.com/documentation/events/onscroll/scrollobserver-settings "ScrollObserver settings")

```
  npm·install·animejs

```

```
  npm·install·animejs

```

```
  import·{·animate·}·from·'animejs'

```

```
  import·{·animate·}·from·'animejs'

```

rotations: 0

rotations: 0

rotations: 0

rotations: 0

```
      current time
      0

```

```
      callback fired
      0

```

```
      current time
      0

```

```
      callback fired
      0

```

```
      current time
      0

```

```
      current time
      0

```

```
      current time
      0

```

```
      current time
      0

```

```
      loops count
      0

```

```
      iteration time
      0

```

```
      loops count
      0

```

```
      iteration time
      0

```

```
      loops count
      0

```

```
      iteration time
      0

```

```
      loops count
      0

```

```
      iteration time
      0

```

```
      loops count
      0

```

```
      iteration time
      0

```

```
      loops count
      0

```

```
      iteration time
      0

```

```
      iteration time
      0

```

```
      current time
      0

```

```
      iteration time
      0

```

```
      current time
      0

```

```
      current time
      0

```

Play

```
      current time
      0

```

Play

```
      fps
      60

```

```
      current time
      0

```

```
      fps
      60

```

```
      current time
      0

```

```
      speed
      2.0

```

```
      current time
      0

```

```
      speed
      2.0

```

```
      current time
      0

```

```
      began
      false

```

```
      current time
      0

```

```
      began
      false

```

```
      current time
      0

```

```
      completed
      false

```

```
      current time
      0

```

```
      completed
      false

```

```
      current time
      0

```

```
      updates
      0

```

```
      current time
      0

```

```
      updates
      0

```

```
      current time
      0

```

```
      loops
      0

```

```
      iteration time
      0

```

```
      loops
      0

```

```
      iteration time
      0

```

```
      paused
      0

```

```
      elapsed time
      0

```

ResumePause

```
      paused
      0

```

```
      elapsed time
      0

```

ResumePause

```
      promise status
      pending

```

```
      current time
      0

```

```
      promise status
      pending

```

```
      current time
      0

```

```
      iteration time
      0

```

Play

```
      iteration time
      0

```

Play

```
      iteration time
      0

```

Reverse

```
      iteration time
      0

```

Reverse

```
      current time
      0

```

Pause

```
      current time
      0

```

Pause

```
      current time
      0

```

Restart

```
      current time
      0

```

Restart

```
      iteration time
      0

```

Alternate

```
      iteration time
      0

```

Alternate

```
      iteration time
      0

```

ResumePauseAlternate

```
      iteration time
      0

```

ResumePauseAlternate

```
      current time
      0

```

Complete

```
      current time
      0

```

Complete

```
      current time
      0

```

Reset

```
      current time
      0

```

Reset

```
      current time
      0

```

PlayCancel

```
      current time
      0

```

PlayCancel

```
      current time
      0

```

Revert

```
      current time
      0

```

Revert

```
      current time
      0

```

Play

```
      current time
      0

```

Play

```
      duration
      2000

```

```
      current time
      0

```

```
      duration
      2000

```

```
      current time
      0

```

## HELLO WORLD

## HELLO WORLD

```
  {"x":0,"y":0}
```

```
  {"x":0,"y":0}
```

```
  {"x":"0"}
```

```
  {"x":"0"}
```

JS / WAAPI

WAAPI

JS / WAAPI

WAAPI

```
  {"number":1337,"unit":"42%"}
```

```
  {"number":1337,"unit":"42%"}
```

```


```

```


```

\+ 90°\- 90°× .5

\+ 90°\- 90°× .5

delaytranslateX

delayrotate

delaytranslateX

delayrotate

translateX

rotate

translateX

rotate

all: 'inQuad'

all: eases.outQuad

x: spring()

rotate: 'inQuad'

all: 'inQuad'

all: eases.outQuad

x: spring()

rotate: 'inQuad'

none

replace

blend

(Hover the squares)

none

replace

blend

(Hover the squares)

utils.round(0)

v => v % 17

v => Math.cos(v) / 2

utils.round(0)

v => v % 17

v => Math.cos(v) / 2

delaytranslateX

delayscale

delaytranslateX

delayscale

duration: 0

duration: 500

duration: 2000

duration: 0

duration: 500

duration: 2000

loop: 3

loop: 3, alternate: true

loop: 3, reversed: true

loop: true

loop: 3

loop: 3, alternate: true

loop: 3, reversed: true

loop: true

loopDelaytranslateXloopDelay

loopDelayscaleloopDelay

loopDelaytranslateXloopDelay

loopDelayscaleloopDelay

alternate: false

alternate: true

alternate: true, reversed: true

alternate: false

alternate: true

alternate: true, reversed: true

reversed: false

reversed: true

reversed: false

reversed: true

autoplay: true

autoplay: false

autoplay: true

autoplay: false

```
    fps
    60

```

```
    fps
    60

```

```
    speed
    1.00

```

```
    speed
    1.00

```

persist: false

persist: true

Alternate

persist: false

persist: true

Alternate

```
    began
    false

```

delaytranslateX

```
    began
    false

```

delaytranslateX

```
    completed
    false

```

delaytranslateX

```
    completed
    false

```

delaytranslateX

```
    updates
    0

```

loopDelaytranslateXloopDelay

```
    updates
    0

```

loopDelaytranslateXloopDelay

```
    updates
    0

```

loopDelaytranslateXloopDelay

```
    updates
    0

```

loopDelaytranslateXloopDelay

```
    renders
    0

```

loopDelaytranslateXloopDelay

```
    renders
    0

```

loopDelaytranslateXloopDelay

```
    loops
    0

```

loopDelaytranslateXloopDelay

```
    loops
    0

```

loopDelaytranslateXloopDelay

```
    paused
    0

```

Animate xPause animRemove target

```
    paused
    0

```

Animate xPause animRemove target

```
    promise status
    pending

```

delaytranslateX

```
    promise status
    pending

```

delaytranslateX

Play

Play

Reverse

Reverse

Pause

Pause

Restart

Restart

Alternate

Alternate

PauseAlternateResume

PauseAlternateResume

Complete

Complete

CancelPlay

CancelPlay

RevertRestart

RevertRestart

Hard resetSoft reset

Hard resetSoft reset

Play

Play

```
  total duration
  0
```

```
  total duration
  0
```

Refresh & Restart

Refresh & Restart

```
      timer 01
      0

```

```
      timer 02
      0

```

```
      timer 03
      0

```

```
      timer 01
      0

```

```
      timer 02
      0

```

```
      timer 03
      0

```

```
      function A
      --

```

```
      function B
      --

```

```
      function C
      --

```

```
      function A
      --

```

```
      function B
      --

```

```
      function C
      --

```

```
    current time
    0

```

```
    current time
    0

```

```
    loops
    0

```

```
    loops
    0

```

```
    loops
    0

```

```
    loops
    0

```

```
    loops
    0

```

```
    loops
    0

```

```
    current time
    0

```

```
    current time
    0

```

```
    paused
    true

```

Play

```
    paused
    true

```

Play

```
    fps
    60

```

```
    fps
    60

```

```
    speed
    2.0

```

```
    speed
    2.0

```

```
    began
    false

```

```
    began
    false

```

```
    completed
    false

```

```
    completed
    false

```

```
    updates
    0

```

```
    updates
    0

```

```
    updates
    0

```

```
    updates
    0

```

```
    renders
    0

```

```
    renders
    0

```

```
    loops
    0

```

```
    loops
    0

```

```
    paused
    0

```

Create TLPause TLRemove shapes

```
    paused
    0

```

Create TLPause TLRemove shapes

```
    promise status
    pending

```

```
    promise status
    pending

```

```
    value
    0

```

```
    value
    0

```

Remove animRemove targetremove tween

Remove animRemove targetremove tween

```
      function A
      --

```

```
      function B
      --

```

```
      function C
      --

```

```
      function A
      --

```

```
      function B
      --

```

```
      function C
      --

```

Play

Play

Reset

Reset

Reverse

Reverse

Pause

Pause

Restart

Restart

Alternate

Alternate

PauseAlternateResume

PauseAlternateResume

Complete

Complete

CancelPlay

CancelPlay

RevertRestart

RevertRestart

Play

Play

```
    total duration
    0

```

```
    total duration
    0

```

Refresh & Restart

Refresh & Restart

Move cursor around

Move cursor around

Move cursor around

Move cursor around

Move cursor around

Move cursor around

linear

outElastic

linear

outElastic

snapped

inverted

snapped

inverted

```
        x
        0

```

```
        y
        0

```

Move cursor around

```
        x
        0

```

```
        y
        0

```

Move cursor around

Move cursor around

Move cursor around

Revert

Revert

x enabled

x disabled

x enabled

x disabled

y enabled

y disabled

y enabled

y disabled

```
    grabs
    0

```

```
    grabs
    0

```

```
    drags
    0

```

```
    drags
    0

```

```
    updates
    0

```

```
    updates
    0

```

scroll down

```
          timer
          1036

```

0 enter: end

0 leave: start

0 enter: start

0 leave: end

1 enter: end

1 leave: start

1 enter: start

1 leave: end

2 enter: end

2 leave: start

2 enter: start

2 leave: end

scroll down

```
          timer
          0

```