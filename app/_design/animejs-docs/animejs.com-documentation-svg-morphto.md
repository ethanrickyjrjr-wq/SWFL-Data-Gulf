morphTo

Search

[SVG](https://animejs.com/documentation/svg "SVG")

[Since 4.0.0](https://github.com/juliangarnier/anime/releases/tag/v4.0.0)

# [morphTo](https://animejs.com/documentation/svg/morphto "morphTo")

Creates a morphing animation from one SVG shape to another by passing the `d` property of a `SVGPathElement` or to the `points` property of a `SVGPolylineElement` or a `SVGPolygonElement` to `svg.morphTo()`.

An optional `precision` parameter can be set to configure the amount of points generated to morph between the two shapes.

If the precision parameter is set `0`, no point extrapolation takes place.

```js
svg.morphTo(shapeTarget, precision);




```

## [Parameters](https://animejs.com/documentation/svg/morphto/\#parameters)

| Name | Accepts |
| --- | --- |
| shapeTarget | [CSS selector](https://animejs.com/documentation/animation/targets/css-selector "CSS selector") \| `SVGPathElement` \| `SVGPolylineElement` \| `SVGPolygonElement` |
| precision=.33 (opt) | A `Number` between `0` and `1` |

## [Returns](https://animejs.com/documentation/svg/morphto/\#returns)

An `Array` containing the shape's starting and final `String` values

```javascript
import { animate, svg, utils } from 'animejs';

const [ $path1, $path2 ] = utils.$('polygon');

function animateRandomPoints() {
  // Update the points attribute on #path-2
  utils.set($path2, { points: generatePoints() });
  // Morph the points of #path-1 into #path-2
  animate($path1, {
    points: svg.morphTo($path2),
    ease: 'inOutCirc',
    duration: 500,
    onComplete: animateRandomPoints
  });
}

// Start the animation
animateRandomPoints();

// A function to generate random points on #path-2 on each iteration
// For demo purpose only
function generatePoints() {
  const total = utils.random(4, 64);
  const r1 = utils.random(4, 56);
  const r2 = 56;
  const isOdd = n => n % 2;
  let points = '';
  for (let i = 0, l = isOdd(total) ? total + 1 : total; i < l; i++) {
    const r = isOdd(i) ? r1 : r2;
    const a = (2 * Math.PI * i / l) - Math.PI / 2;
    const x = 152 + utils.round(r * Math.cos(a), 0);
    const y = 56 + utils.round(r * Math.sin(a), 0);
    points += `${x},${y} `;
  }
  return points;
}




```

```html
<svg viewBox="0 0 304 112">
  <g stroke-width="2" stroke="currentColor" stroke-linejoin="round" fill="none" fill-rule="evenodd">
    <polygon id="path-1" points="152,4 170,38 204,56 170,74 152,108 134,74 100,56 134,38"></polygon>
    <polygon style="opacity: 0" id="path-2" points="152,4 170,38 204,56 170,74 152,108 134,74 100,56 134,38"></polygon>
  </g>
</svg>




```

**Previous** **Next**

- [SVG](https://animejs.com/documentation/svg "SVG")
- [createDrawable](https://animejs.com/documentation/svg/createdrawable "createDrawable")