createDrawable

Search

[SVG](https://animejs.com/documentation/svg "SVG")

[Since 4.0.0](https://github.com/juliangarnier/anime/releases/tag/v4.0.0)

# [createDrawable](https://animejs.com/documentation/svg/createdrawable "createDrawable")

Creates a `Proxy` of an `SVGElement` exposing an extra `draw` property that defines how much of the line is visible / drawn.

```js
const [ drawable ] = svg.createDrawable(target);




```

## [Parameters](https://animejs.com/documentation/svg/createdrawable/\#parameters)

| Name | Accepts |
| --- | --- |
| target | [CSS selector](https://animejs.com/documentation/animation/targets/css-selector "CSS selector") \| `SVGLineElement` \| `SVGPathElement` \| `SVGPolylineElement` \| `SVGPolylineElement` \| `SVGRectElement` |

## [Returns](https://animejs.com/documentation/svg/createdrawable/\#returns)

An `Array` of `Proxy``SVGElement`

The added `draw` property accepts a `String` containing a `start` and `end` values separated by an empty space to define how much of the line is drawn.

```js
const [ drawable ] = svg.createDrawable(target);

                            0                     1
drawable.draw = '0 1';      |[———————————————————]|

                            0         .5
drawable.draw = '0 .5';     |[—————————]          |

                                 .25       .75
drawable.draw = '.25 .75';  |     [—————————]     |

                                      .5          1
drawable.draw = '.5 1';     |          [—————————]|

                                                1 1
drawable.draw = '1 1';      |                   []|




```

Animating an element with the `vector-effect` attribute/styles set to `non-scaling-stroke` can be slow since the scale factor value for the path must be recalculated on every tick in order to handle changes in the size of the SVG.

```javascript
import { animate, svg, stagger } from 'animejs';

animate(svg.createDrawable('.line'), {
  draw: ['0 0', '0 1', '1 1'],
  ease: 'inOutQuad',
  duration: 2000,
  delay: stagger(100),
  loop: true
});




```

```html
<svg viewBox="0 0 304 112">
  <g stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
    <path class="line" d="M59 90V56.136C58.66 46.48 51.225 39 42 39c-9.389 0-17 7.611-17 17s7.611 17 17 17h8.5v17H42C23.222 90 8 74.778 8 56s15.222-34 34-34c18.61 0 33.433 14.994 34 33.875V90H59z"/>
    <polyline class="line" points="59 22.035 59 90 76 90 76 22 59 22"/>
    <path class="line" d="M59 90V55.74C59.567 36.993 74.39 22 93 22c18.778 0 34 15.222 34 34v34h-17V56c0-9.389-7.611-17-17-17-9.225 0-16.66 7.48-17 17.136V90H59z"/>
    <polyline class="line" points="127 22.055 127 90 144 90 144 22 127 22"/>
    <path class="line" d="M127 90V55.74C127.567 36.993 142.39 22 161 22c18.778 0 34 15.222 34 34v34h-17V56c0-9.389-7.611-17-17-17-9.225 0-16.66 7.48-17 17.136V90h-17z"/>
    <path class="line" d="M118.5 22a8.5 8.5 0 1 1-8.477 9.067v-1.134c.283-4.42 3.966-7.933 8.477-7.933z"/>
    <path class="line" d="M144 73c-9.389 0-17-7.611-17-17v-8.5h-17V56c0 18.778 15.222 34 34 34V73z"/>
    <path class="line" d="M178 90V55.74C178.567 36.993 193.39 22 212 22c18.778 0 34 15.222 34 34v34h-17V56c0-9.389-7.611-17-17-17-9.225 0-16.66 7.48-17 17.136V90h-17z"/>
    <path class="line" d="M263 73c-9.389 0-17-7.611-17-17s7.611-17 17-17c9.18 0 16.58 7.4 17 17h-17v17h34V55.875C296.433 36.994 281.61 22 263 22c-18.778 0-34 15.222-34 34s15.222 34 34 34V73z"/>
    <path class="line" d="M288.477 73A8.5 8.5 0 1 1 280 82.067v-1.134c.295-4.42 3.967-7.933 8.477-7.933z"/>
  </g>
</svg>




```

**Previous** **Next**

- [morphTo](https://animejs.com/documentation/svg/morphto "morphTo")
- [createMotionPath](https://animejs.com/documentation/svg/createmotionpath "createMotionPath")

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