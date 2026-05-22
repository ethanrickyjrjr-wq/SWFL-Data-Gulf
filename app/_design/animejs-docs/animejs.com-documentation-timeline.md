Timeline

Search

# [Timeline](https://animejs.com/documentation/timeline "Timeline")

## [Synchronises animations, timers, and callbacks together.](https://animejs.com/documentation/timeline/\#synchronises-animations-timers-and-callbacks-together)

Timelines are created using the `createTimeline()` method imported from the main `'animejs'` module:

```js
import { createTimeline } from 'animejs';

const timeline = createTimeline(parameters);




```

Or imported as a standalone module from the `'animejs/timeline'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { createTimeline } from 'animejs/timeline';




```

## [Parameters](https://animejs.com/documentation/timeline/\#parameters)

| Name | Accepts |
| --- | --- |
| parameters (opt) | An `Object` of [Timeline playback settings](https://animejs.com/documentation/timeline/timeline-playback-settings "Timeline playback settings") and [Timeline callbacks](https://animejs.com/documentation/timeline/timeline-callbacks "Timeline callbacks") |

## [Returns](https://animejs.com/documentation/timeline/\#returns)

`Timeline`

A `Timeline` instance exposes [methods](https://animejs.com/documentation/animation/animation-methods "timeline methods") used to add animations, timers, callbacks and labels to it.

```js
timeline.add(target, animationParameters, position);
timeline.add(timerParameters, position);
timeline.sync(timelineB, position);
timeline.call(callbackFunction, position);
timeline.label(labelName, position);




```

```javascript
import { createTimeline } from 'animejs';

const tl = createTimeline({ defaults: { duration: 750 } });

tl.label('start')
  .add('.square', { x: '15rem' }, 500)
  .add('.circle', { x: '15rem' }, 'start')
  .add('.triangle', { x: '15rem', rotate: '1turn' }, '<-=500');




```

```html
<div class="large row">
  <div class="medium pyramid">
    <div class="triangle"></div>
    <div class="square"></div>
    <div class="circle"></div>
  </div>
</div>




```

**In this section**

- [Add timers](https://animejs.com/documentation/timeline/add-timers "Add timers")
- [Add animations](https://animejs.com/documentation/timeline/add-animations "Add animations")
- [Sync WAAPI animations](https://animejs.com/documentation/timeline/sync-waapi-animations "Sync WAAPI animations")
- [Sync timelines](https://animejs.com/documentation/timeline/sync-timelines "Sync timelines")
- [Call functions](https://animejs.com/documentation/timeline/call-functions "Call functions")
- [Time position](https://animejs.com/documentation/timeline/time-position "Time position")
- [Playback settings](https://animejs.com/documentation/timeline/timeline-playback-settings "Timeline playback settings")
- [Callbacks](https://animejs.com/documentation/timeline/timeline-callbacks "Timeline callbacks")
- [Methods](https://animejs.com/documentation/timeline/timeline-methods "Timeline methods")
- [Properties](https://animejs.com/documentation/timeline/timeline-properties "Timeline properties")

**Previous** **Next**

- [Animation properties](https://animejs.com/documentation/animation/animation-properties "Animation properties")
- [Add timers](https://animejs.com/documentation/timeline/add-timers "Add timers")