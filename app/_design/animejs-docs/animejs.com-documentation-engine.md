Engine

Search

# [Engine](https://animejs.com/documentation/engine "Engine")

## [Drives and synchronises all](https://animejs.com/documentation/engine/\#drives-and-synchronises-all-animation-timer-and-timeline-instances) [Animation](https://animejs.com/documentation/animation "Animation"), [Timer](https://animejs.com/documentation/timer "Timer"), and [Timeline](https://animejs.com/documentation/timeline "Timeline") instances.

```js
import { engine } from 'animejs';




```

### Execution order

Timers, animations, and timelines are executed in the order they are added to the engine. To control the execution order within the engine tick loop, use the `priority` parameter: instances with lower values are executed first.

```js
animate(targets, { x: 100, priority: 0 }); // Runs first
animate(targets, { y: 100, priority: 2 }); // Runs last
animate(targets, { z: 100 });              // Default priority: 1




```

**In this section**

- [Parameters](https://animejs.com/documentation/engine/engine-parameters "Engine parameters")
- [Methods](https://animejs.com/documentation/engine/engine-methods "Engine methods")
- [Properties](https://animejs.com/documentation/engine/engine-properties "Engine properties")
- [Engine defaults](https://animejs.com/documentation/engine/engine-defaults "Engine defaults")

**Previous** **Next**

- [waapi.convertEase()](https://animejs.com/documentation/web-animation-api/waapi-convertease "waapi.convertEase()")
- [Engine parameters](https://animejs.com/documentation/engine/engine-parameters "Engine parameters")