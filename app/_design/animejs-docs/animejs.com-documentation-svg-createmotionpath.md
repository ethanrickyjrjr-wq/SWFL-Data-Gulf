createMotionPath

Search

[SVG](https://animejs.com/documentation/svg "SVG")

[Since 4.0.0](https://github.com/juliangarnier/anime/releases/tag/v4.0.0)

# [createMotionPath](https://animejs.com/documentation/svg/createmotionpath "createMotionPath")

Creates pre-defined [Tween parameter](https://animejs.com/documentation/animation/tween-parameters "Tween parameter") objects that animate along an SVGPathElement's coordinates and inclination.

```js
const { translateX, translateY, rotate } = svg.createMotionPath(path, offset);




```

## [Parameters](https://animejs.com/documentation/svg/createmotionpath/\#parameters)

| Name | Type |
| --- | --- |
| path | [CSS selector](https://animejs.com/documentation/animation/targets/css-selector "CSS selector") \| `SVGPathElement` |
| offset=0 (opt) | A `Number` between `0` and `1` |

## [Returns](https://animejs.com/documentation/svg/createmotionpath/\#returns)

An `Object` with the following properties:

| Name | Type | Description |
| --- | --- | --- |
| translateX | [Tween parameter](https://animejs.com/documentation/animation/tween-parameters "Tween parameter") | Map to the x coordinate of the path element |
| translateY | [Tween parameter](https://animejs.com/documentation/animation/tween-parameters "Tween parameter") | Map to the y coordinate of the path element |
| rotate | [Tween parameter](https://animejs.com/documentation/animation/tween-parameters "Tween parameter") | Map to the angle of the path element |

```javascript
import { animate, svg } from 'animejs';

// Animate the transforms properties of .car the motion path values
const carAnimation = animate('.car', {
  ease: 'linear',
  duration: 5000,
  loop: true,
  ...svg.createMotionPath('path')
});

// Line drawing animation following the motion path values
// For demo aesthetic only
animate(svg.createDrawable('path'), {
  draw: '0 1',
  ease: 'linear',
  duration: 5000,
  loop: true,
});




```

```html
<svg viewBox="0 0 304 112">
  <title>Suzuka</title>
  <g stroke="none" fill="none" fill-rule="evenodd">
    <path d="M189.142857,4 C227.456875,4 248.420457,4.00974888 256.864191,4.00974888 C263.817211,4.00974888 271.61219,3.69583517 274.986231,6.63061513 C276.382736,7.84531176 279.193529,11.3814152 280.479499,13.4815847 C281.719344,15.5064248 284.841964,20.3571626 275.608629,20.3571626 C265.817756,20.3571626 247.262478,19.9013915 243.955117,19.9013915 C239.27946,19.9013915 235.350655,24.7304885 228.6344,24.7304885 C224.377263,24.7304885 219.472178,21.0304113 214.535324,21.0304113 C207.18393,21.0304113 200.882842,30.4798911 194.124187,30.4798911 C186.992968,30.4798911 182.652552,23.6245972 173.457298,23.6245972 C164.83277,23.6245972 157.191045,31.5424105 157.191045,39.1815359 C157.191045,48.466779 167.088672,63.6623005 166.666679,66.9065088 C166.378668,69.1206889 155.842137,79.2568633 151.508744,77.8570506 C145.044576,75.7689355 109.126667,61.6405346 98.7556561,52.9785141 C96.4766876,51.0750861 89.3680347,39.5769094 83.4195005,38.5221785 C80.6048001,38.0231057 73.0179337,38.7426555 74.4158694,42.6956376 C76.7088819,49.1796531 86.3280337,64.1214904 87.1781062,66.9065088 C88.191957,70.2280995 86.4690152,77.0567847 82.2060607,79.2503488 C79.2489435,80.7719756 73.1324132,82.8858479 64.7015706,83.0708761 C55.1604808,83.2802705 44.4254811,80.401884 39.1722168,80.401884 C25.7762119,80.401884 24.3280517,89.1260466 22.476679,94.4501705 C21.637667,96.8629767 20.4337535,108 33.2301959,108 C37.8976087,108 45.0757044,107.252595 53.4789069,103.876424 C61.8821095,100.500252 122.090049,78.119656 128.36127,75.3523302 C141.413669,69.5926477 151.190142,68.4987755 147.018529,52.0784879 C143.007818,36.291544 143.396957,23.4057975 145.221196,19.6589263 C146.450194,17.1346449 148.420955,14.8552817 153.206723,15.7880203 C155.175319,16.1716965 155.097637,15.0525421 156.757598,11.3860986 C158.417558,7.71965506 161.842736,4.00974888 167.736963,4.00974888 C177.205308,4.00974888 184.938832,4 189.142857,4 Z" id="suzuka" stroke="currentColor" stroke-width="2"></path>
  </g>
</svg>
<div class="square car motion-path-car" style="transform: translateX(189px) translateY(4px);"></div>




```

```css
#svg-createmotionpath {
  position: relative;
}

#svg-createmotionpath .car {
  position: absolute;
  width: 16px;
  height: 8px;
  left: -8px;
  top: -5px;
  color: #FFF;
}

#svg-createmotionpath .docs-demo-template .car {
  display: none;
}




```

**Previous** **Next**

- [createDrawable](https://animejs.com/documentation/svg/createdrawable "createDrawable")
- [Text](https://animejs.com/documentation/text "Text")

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

Suzuka

Suzuka