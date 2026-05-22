Easings

Search

# [Easings](https://animejs.com/documentation/easings "Easings")

## [A collection of easing functions and a physics-based spring generator](https://animejs.com/documentation/easings/\#a-collection-of-easing-functions-and-a-physics-based-spring-generator)

Use the [**Easing Functions Editor**](https://animejs.com/easing-editor) to visualize, create and customize easing functions.

All easing functions are available on the `easings` object imported from the main `'animejs'` module:

```js
import { easings } from 'animejs';

easings.eases.inOut(3);
easings.cubicBezier(.7, .1, .5, .9);
easings.spring({ bounce: .35 });




```

Or imported directly from the main `'animejs'` module:

```js
import { eases, cubicBezier, spring } from 'animejs';

eases.inOut(3);
cubicBezier(.7, .1, .5, .9);
spring({ bounce: .35 });




```

Or imported as a standalone module from the `'animejs/easings'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { eases, cubicBezier, spring } from 'animejs/easings';




```

Easing and spring functions can be passed to the [`ease`](https://animejs.com/documentation/animation/tween-parameters/ease "ease") and [`playbackEase`](https://animejs.com/documentation/animation/animation-playback-settings/playbackease) parameters of the [`animate()`](https://animejs.com/documentation/animation "animate()") method or the [`ease`](https://animejs.com/documentation/utilities/stagger/stagger-parameters/stagger-ease) parameter of the [`stagger()`](https://animejs.com/documentation/utilities/stagger) function.

```js
import { cubicBezier, linear, spring } from 'animejs';

animate(target, { x: 100, ease: 'inOut(3)' });
animate(target, { x: 100, ease: cubicBezier(.7, .1, .5, .9) });
animate(target, { x: 100, ease: spring({ bounce: .35 }) });




```

```javascript
import { animate, waapi, cubicBezier, spring } from 'animejs';

animate('.row:nth-child(1) .square', {
  x: '17rem',
  rotate: 360,
  ease: 'out(3)', // Built-in ease
});

animate('.row:nth-child(2) .square', {
  x: '17rem',
  rotate: 360,
  ease: cubicBezier(.7, .1, .5, .9), // Custom cubic Bezier curves
});

waapi.animate('.row:nth-child(3) .square', {
  x: '17rem',
  rotate: 360,
  ease: spring({ bounce: .35 }), // Spring physics
});




```

```html
<div class="medium row">
  <div class="square"></div>
  <div class="padded label">'inQuad'</div>
</div>
<div class="medium row">
  <div class="square"></div>
  <div class="padded label">cubicBezier(.7, .1, .5, .9)</div>
</div>
<div class="medium row">
  <div class="square"></div>
  <div class="padded label">spring({ bounce: 1.25 })</div>
</div>




```

**In this section**

- [Built-in eases](https://animejs.com/documentation/easings/built-in-eases "Built-in eases")
- [Cubic Bézier](https://animejs.com/documentation/easings/cubic-bezier-easing "Cubic Bézier easing")
- [Linear](https://animejs.com/documentation/easings/linear-easing "Linear easing")
- [Steps](https://animejs.com/documentation/easings/steps-easing "Steps easing")
- [Irregular](https://animejs.com/documentation/easings/irregular-easing "Irregular easing")
- [Spring](https://animejs.com/documentation/easings/spring "Spring")

**Previous** **Next**

- [Chain-able utility functions](https://animejs.com/documentation/utilities/chain-able-utility-functions "Chain-able utility functions")
- [Built-in eases](https://animejs.com/documentation/easings/built-in-eases "Built-in eases")

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

```
    releases
    0

```

```
    releases
    0

```

```
    snaps
    0

```

```
    snaps
    0

```

```
    stops
    0

```

```
    stops
    0

```

```
      resizes
      0

```

```
      resizes
      0

```

'inQuad'

cubicBezier(.7, .1, .5, .9)

spring({ bounce: 1.25 })

'inQuad'

cubicBezier(.7, .1, .5, .9)

spring({ bounce: 1.25 })