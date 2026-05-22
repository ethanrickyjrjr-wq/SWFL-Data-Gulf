Improvements to the Web Animation API

Search

[Web Animation API](https://animejs.com/documentation/web-animation-api "Web Animation API")

[Since 4.0.0](https://github.com/juliangarnier/anime/releases/tag/v4.0.0)

# [Improvements to the Web Animation API](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api "Improvements to the Web Animation API")

The `waapi.animate()` method adds lots of quality of life improvements and greatly improves the overall experience of using WAAPI.

On top of all the improvements to the API listed in this chapter, it is also possible to link WAAPI animations to Anime.js built-in [ScrollObserver](https://animejs.com/documentation/events/onscroll "ScrollObserver")

```js
waapi.animate('.square', {
  translate: '100px',
  autoplay: onScroll()
});




```

And use a [Scope](https://animejs.com/documentation/scope "Scope") for easy media queries handling and component cleanup:

```js
createScope({
  mediaQueries: { reduceMotion: '(prefers-reduced-motion)' }
})
.add(({ matches }) => {
  const { reduceMotion } = matches;
  waapi.animate('.square', {
    transform: reduceMotion ? ['100px', '100px'] : '100px',
    opacity: [0, 1],
  });
});




```

**In this section**

- [Sensible defaults](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/sensible-defaults "Sensible defaults")
- [Multi-targets animation](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/multi-targets-animation "Multi-targets animation")
- [Default units](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/default-units "Default units")
- [Function based values](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/function-based-values "Function based values")
- [Individual transforms](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/individual-css-transforms "Individual CSS transforms")
- [Individual property params](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/individual-property-parameters "Individual property parameters")
- [Spring and custom easings](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/spring-and-custom-easings "Spring and custom easings")

**Previous** **Next**

- [Hardware-accelerated animations](https://animejs.com/documentation/web-animation-api/hardware-accelerated-animations "Hardware-accelerated animations")
- [Sensible defaults](https://animejs.com/documentation/web-animation-api/improvements-to-the-web-animation-api/sensible-defaults "Sensible defaults")

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