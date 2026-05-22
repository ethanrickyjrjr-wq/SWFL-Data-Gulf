Timer

Search

# [Timer](https://animejs.com/documentation/timer "Timer")

## [Schedules and controls timed callbacks that can be used as an alternative to `setTimeout()` or `setInterval()`, keeping animations and callbacks synchronized.](https://animejs.com/documentation/timer/\#schedules-and-controls-timed-callbacks-that-can-be-used-as-an-alternative-to-settimeout-or-setinterval-keeping-animations-and-ca)

Timers are created using the `createTimer()` method imported from the main `'animejs'` module:

```js
import { createTimer } from 'animejs';

const timer = createTimer(parameters);




```

Or imported as a standalone module from the `'animejs/timer'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { createTimer } from 'animejs/timer';




```

## [Parameters](https://animejs.com/documentation/timer/\#parameters)

| Name | Accepts |
| --- | --- |
| parameters (opt) | An `Object` of [Timer playback settings](https://animejs.com/documentation/timer/timer-playback-settings "Timer playback settings") and [Timer callbacks](https://animejs.com/documentation/timer/timer-callbacks "Timer callbacks") |

## [Returns](https://animejs.com/documentation/timer/\#returns)

`Timer`

```javascript
import { createTimer } from 'animejs';

const [ $time, $count ] = utils.$('.value');

createTimer({
  duration: 1000,
  loop: true,
  frameRate: 30,
  onUpdate: self => $time.innerHTML = self.currentTime,
  onLoop: self => $count.innerHTML = self._currentIteration
});




```

```html
<div class="large centered row">
  <div class="half col">
    <pre class="large log row">
      <span class="label">current time</span>
      <span class="value lcd">0</span>
    </pre>
  </div>
  <div class="half col">
    <pre class="large log row">
      <span class="label">callback fired</span>
      <span class="value lcd">0</span>
    </pre>
  </div>
</div>




```

**In this section**

- [Playback settings](https://animejs.com/documentation/timer/timer-playback-settings "Timer playback settings")
- [Callbacks](https://animejs.com/documentation/timer/timer-callbacks "Timer callbacks")
- [Methods](https://animejs.com/documentation/timer/timer-methods "Timer methods")
- [Properties](https://animejs.com/documentation/timer/timer-properties "Timer properties")

**Previous** **Next**

- [Using with React](https://animejs.com/documentation/getting-started/using-with-react "Using with React")
- [Timer playback settings](https://animejs.com/documentation/timer/timer-playback-settings "Timer playback settings")

```
      current time
      166

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