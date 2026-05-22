Draggable

Search

# [Draggable](https://animejs.com/documentation/draggable "Draggable")

## [Adds draggable capabilities to DOM Elements.](https://animejs.com/documentation/draggable/\#adds-draggable-capabilities-to-dom-elements)

Draggables are created using the `createDraggable()` method imported from the main `'animejs'` module:

```js
import { createDraggable } from 'animejs';

const draggable = createDraggable(target, parameters);




```

Or imported as a standalone module from the `'animejs/draggable'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { createDraggable } from 'animejs/draggable';




```

## [Parameters](https://animejs.com/documentation/draggable/\#parameters)

| Name | Accepts |
| --- | --- |
| target | [CSS Selector](https://animejs.com/documentation/animation/targets/css-selector "CSS Selector") \| [DOM Element](https://animejs.com/documentation/animation/targets/dom-elements "DOM Element") |
| parameters (opt) | An `Object` of [Draggable axes parameters](https://animejs.com/documentation/draggable/draggable-axes-parameters "Draggable axes parameters"), [Draggable settings](https://animejs.com/documentation/draggable/draggable-settings "Draggable settings") and [Draggable callbacks](https://animejs.com/documentation/draggable/draggable-callbacks "Draggable callbacks") |

## [Returns](https://animejs.com/documentation/draggable/\#returns)

`Draggable`

```javascript
import { createDraggable } from 'animejs';

createDraggable('.square');




```

```html
<div class="large row centered">
  <div class="square draggable"></div>
</div>




```

**In this section**

- [Axes parameters](https://animejs.com/documentation/draggable/draggable-axes-parameters "Draggable axes parameters")
- [Settings](https://animejs.com/documentation/draggable/draggable-settings "Draggable settings")
- [Callbacks](https://animejs.com/documentation/draggable/draggable-callbacks "Draggable callbacks")
- [Methods](https://animejs.com/documentation/draggable/draggable-methods "Draggable methods")
- [Properties](https://animejs.com/documentation/draggable/draggable-properties "Draggable properties")

**Previous** **Next**

- [Animatable properties](https://animejs.com/documentation/animatable/animatable-properties "Animatable properties")
- [Draggable axes parameters](https://animejs.com/documentation/draggable/draggable-axes-parameters "Draggable axes parameters")