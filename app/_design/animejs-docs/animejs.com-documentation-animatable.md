Animatable

Search

# [Animatable](https://animejs.com/documentation/animatable "Animatable")

## [Efficiently animates target properties, making it an ideal replacement for `animate()` and `utils.set()` in situations where values change frequently, such as cursor events or animation loops.](https://animejs.com/documentation/animatable/\#efficiently-animates-target-properties-making-it-an-ideal-replacement-for-animate-and-utils-set-in-situations-where-values-chang)

Animatable are created using the `createAnimatable()` method imported from the main `'animejs'` module:

```js
import { createAnimatable } from 'animejs';

const animatable = createAnimatable(targets, parameters);




```

Or imported as a standalone module from the `'animejs/animatable'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { createAnimatable } from 'animejs/animatable';




```

## [Parameters](https://animejs.com/documentation/animatable/\#parameters)

| Name | Accepts |
| --- | --- |
| targets | [Targets](https://animejs.com/documentation/animation/targets "Targets") |
| parameters | An `Object` of [Animatable settings](https://animejs.com/documentation/animatable/animatable-settings "Animatable settings") |

## [Returns](https://animejs.com/documentation/animatable/\#returns)

`Animatable`

An `Animatable` instance exposes animatable property functions to [get](https://animejs.com/documentation/animatable/animatable-methods/getters "get") and [set](https://animejs.com/documentation/animatable/animatable-methods/setters "set") values.

```js
animatable.propertyName(value, duration, ease); // Triggers an animation
animatable.propertyName(); // Returns the current value




```

For performance reasons, only `Number` or `Array<Number>` can be passed to an animatable property function.

```javascript
import { createAnimatable, utils } from 'animejs';

const $demos = document.querySelector('#docs-demos');
const $demo = document.querySelector('.docs-demo.is-active');

let bounds = $demo.getBoundingClientRect();
const refreshBounds = () => bounds = $demo.getBoundingClientRect();

const animatableSquare = createAnimatable('.square', {
  x: 500, // Define the x duration to be 500ms
  y: 500, // Define the y duration to be 500ms
  ease: 'out(3)',
});

const onMouseMove = e => {
  const { width, height, left, top } = bounds;
  const hw = width / 2;
  const hh = height / 2;
  const x = utils.clamp(e.clientX - left - hw, -hw, hw);
  const y = utils.clamp(e.clientY - top - hh, -hh, hh);
  animatableSquare.x(x); // Animate the x value in 500ms
  animatableSquare.y(y); // Animate the y value in 500ms
}

window.addEventListener('mousemove', onMouseMove);
$demos.addEventListener('scroll', refreshBounds);




```

```html
<div class="large centered row">
  <div class="col">
    <div class="square"></div>
  </div>
</div>
<div class="small centered row">
  <span class="label">Move cursor around</span>
</div>




```

**In this section**

- [Settings](https://animejs.com/documentation/animatable/animatable-settings "Animatable settings")
- [Methods](https://animejs.com/documentation/animatable/animatable-methods "Animatable methods")
- [Properties](https://animejs.com/documentation/animatable/animatable-properties "Animatable properties")

**Previous** **Next**

- [Timeline properties](https://animejs.com/documentation/timeline/timeline-properties "Timeline properties")
- [Animatable settings](https://animejs.com/documentation/animatable/animatable-settings "Animatable settings")

Move cursor around

Move cursor around