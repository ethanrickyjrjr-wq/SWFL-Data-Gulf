Using with vanilla JS

Search

[Getting started](https://animejs.com/documentation/getting-started "Getting started")

[Since 4.0.0](https://github.com/juliangarnier/anime/releases/tag/v4.0.0)

# [Using with vanilla JS](https://animejs.com/documentation/getting-started/using-with-vanilla-js "Using with vanilla JS")

Using Anime.js in vanilla JavaScript is pretty straightforward, simply import the modules you need and start animating.

The following example showcase how to uses Anime.js methods with a vanilla JS code base.

```javascript
import { animate, utils, createDraggable, spring } from 'animejs';

const [ $logo ] = utils.$('.logo.js');
const [ $button ] = utils.$('button');
let rotations = 0;

// Created a bounce animation loop
animate('.logo.js', {
  scale: [\
    { to: 1.25, ease: 'inOut(3)', duration: 200 },\
    { to: 1, ease: spring({ bounce: .7 }) }\
  ],
  loop: true,
  loopDelay: 250,
});

// Make the logo draggable around its center
createDraggable('.logo.js', {
  container: [0, 0, 0, 0],
  releaseEase: spring({ bounce: .7 })
});

// Animate logo rotation on click
const rotateLogo = () => {
  rotations++;
  $button.innerText = `rotations: ${rotations}`;
  animate($logo, {
    rotate: rotations * 360,
    ease: 'out(4)',
    duration: 1500,
  });
}

$button.addEventListener('click', rotateLogo);




```

```html
<div class="large centered row">
  <svg class="logo js" preserveAspectRatio="xMidYMid meet" viewBox="0 0 630 630"><path fill="currentColor" d="M577,0 C606.271092,0 630,23.7289083 630,53 L630,577 C630,606.271092 606.271092,630 577,630 L53,630 C23.7289083,630 0,606.271092 0,577 L0,53 C0,23.7289083 23.7289083,0 53,0 L577,0 Z M479.5,285.89 C426.63,285.89 392.8,319.69 392.8,364.09 C392.8,411.808 420.615238,434.63146 462.622716,452.742599 L478.7,459.64 L483.441157,461.719734 C507.57404,472.359996 521.8,479.858 521.8,498.94 C521.8,515.88 506.13,528.14 481.6,528.14 C452.4,528.14 435.89,512.91 423.2,492.19 L375.09,520.14 C392.47,554.48 427.99,580.68 482.97,580.68 C539.2,580.68 581.07,551.48 581.07,498.18 C581.07,448.74 552.67,426.75 502.37,405.18 L487.57,398.84 L485.322788,397.859899 C461.5199,387.399087 451.17,380.1172 451.17,362.89 C451.17,348.52 462.16,337.52 479.5,337.52 C496.5,337.52 507.45,344.69 517.6,362.89 L563.7,333.29 C544.2,298.99 517.14,285.89 479.5,285.89 Z M343.09,289.27 L283.89,289.27 L283.89,490.57 C283.89,520.16 271.62,527.77 252.17,527.77 C231.83,527.77 223.37,513.82 214.07,497.32 L165.88,526.495 C179.84,556.04 207.29,580.57 254.69,580.57 C307.15,580.57 343.09,552.67 343.09,491.37 L343.09,289.27 Z"/></svg>
</div>
<div class="medium row">
  <fieldset class="controls">
    <button>rotations: 0</button>
  </fieldset>
</div>




```

```css
.logo.js {
  width: 150%;
  height: 150%;
}




```

**Previous** **Next**

- [Module imports](https://animejs.com/documentation/getting-started/module-imports "Module imports")
- [Using with React](https://animejs.com/documentation/getting-started/using-with-react "Using with React")

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

```
      resizes
      0

```

```
      resizes
      0

```

Disable

Disable

Enable

Enable

Set random x

Set random x

Set random y

Set random y

Animate in view

Animate in view

Scroll in view

Scroll in view

Stop

Stop

Reset

Reset

Revert

Revert

Refresh

Refresh

Item A

Item B

Item C

Item D

Item A

Item B

Item C

Item D

A 1

A 2

B 1

B 2

Animate AAnimate B

A 1

A 2

B 1

B 2

Animate AAnimate B

Item A

Item B

Item C

flex-row

Item A

Item B

Item C

flex-row

Item A

Item B

Item C

Item D

Item E

Stagger animation

Item A

Item B

Item C

Item D

Item E

Stagger animation

A

B

C

D

E

F

G

Shuffle

A

B

C

D

E

F

G

Shuffle

Add item

Add item

1

2

3

4

5

6

7

8

9

10

Remove item

1

2

3

4

5

6

7

8

9

10

Remove item

Item A

Swap parent

Item A

Swap parent

## Item A

### (500ms)

This p tag is hidden by default and only visible when appended inside the dialog element. Its position and opacity are automatically animated.

## Item B

### (1000ms)

This p tag is hidden by default and only visible when appended inside the dialog element. Its position and opacity are automatically animated.

## Item C

### (2000ms)

This p tag is hidden by default and only visible when appended inside the dialog element. Its position and opacity are automatically animated.

## Item A

### (500ms)

This p tag is hidden by default and only visible when appended inside the dialog element. Its position and opacity are automatically animated.

## Item B

### (1000ms)

This p tag is hidden by default and only visible when appended inside the dialog element. Its position and opacity are automatically animated.

## Item C

### (2000ms)

This p tag is hidden by default and only visible when appended inside the dialog element. Its position and opacity are automatically animated.

These p tags are not targeted

So they simply swap between states

Animate without fadeAnimate with fade

These p tags are not targeted

So they simply swap between states

Animate without fadeAnimate with fade

Item 1

Item 2

Item 3

500 ms delayStaggered delay

Item 1

Item 2

Item 3

500 ms delayStaggered delay

default

duration

1000ms

duration

Animate defaultAnimate 1000ms

default

duration

1000ms

duration

Animate defaultAnimate 1000ms

Item 1

Item 2

'outExpo'spring()

Item 1

Item 2

'outExpo'spring()

animate

box-shadow

Animate

animate

box-shadow

Animate

Add item

Add item

1

2

3

4

5

6

7

8

9

10

Remove item

1

2

3

4

5

6

7

8

9

10

Remove item

These p tags are not animated

They only swap at 50% progress

Animate with fadeAnimate without fade

These p tags are not animated

They only swap at 50% progress

Animate with fadeAnimate without fade

Item 1

Item 2

Item 3

record() + animate()

Item 1

Item 2

Item 3

record() + animate()

Item 1

Item 2

Item 3

record() + animate()

Item 1

Item 2

Item 3

record() + animate()

Item 1

Item 2

Item 3

update()

Item 1

Item 2

Item 3

update()

Item 1

Item 2

Item 3

animate()revert()

Item 1

Item 2

Item 3

animate()revert()

Item A

Item A

Toggle visibility

Item A

Item A

Toggle visibility

outside scope

inside scope

outside scope

outside scope

inside scope

outside scope

scope 1

scope 2

scope 3

scope 1

scope 2

scope 3

Revert row 1Revert row 2

Revert row 1Revert row 2

Refresh row 1Refresh row 2

Refresh row 1Refresh row 2