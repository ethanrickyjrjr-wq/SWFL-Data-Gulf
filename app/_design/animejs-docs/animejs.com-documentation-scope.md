Scope

Search

# [Scope](https://animejs.com/documentation/scope "Scope")

## [Anime.js instances declared inside a Scope can react to media queries, use custom root elements, share default parameters, and be reverted in batch, streamlining work in responsive and component-based environments.](https://animejs.com/documentation/scope/\#anime-js-instances-declared-inside-a-scope-can-react-to-media-queries-use-custom-root-elements-share-default-parameters-and-be-r)

Scopes are created using the `createScope()` method imported from the main `'animejs'` module:

```js
import { createScope } from 'animejs';

const scope = createScope(parameters);




```

Or imported as a standalone module from the `'animejs/scope'` [subpath](https://animejs.com/documentation/getting-started/module-imports "subpath"):

```js
import { createScope } from 'animejs/scope';




```

## [Parameters](https://animejs.com/documentation/scope/\#parameters)

| Name | Accepts |
| --- | --- |
| parameters (opt) | [Scope parameters](https://animejs.com/documentation/scope/scope-parameters "Scope parameters") |

## [Returns](https://animejs.com/documentation/scope/\#returns)

`Scope`

```javascript
import { animate, utils, createScope } from 'animejs';

createScope({
  mediaQueries: {
    isSmall: '(max-width: 200px)',
    reduceMotion: '(prefers-reduced-motion)',
  }
})
.add(self => {

  const { isSmall, reduceMotion } = self.matches;

  if (isSmall) {
    utils.set('.square', { scale: .5 });
  }

  animate('.square', {
    x: isSmall ? 0 : ['-35vw', '35vw'],
    y: isSmall ? ['-40vh', '40vh'] : 0,
    loop: true,
    alternate: true,
    duration: reduceMotion ? 0 : isSmall ? 750 : 1250
  });

});




```

```html
<div class="iframe-content resizable">
  <div class="large centered row">
    <div class="col">
      <div class="square"></div>
    </div>
  </div>
</div>




```

**In this section**

- [Add constructor function](https://animejs.com/documentation/scope/add-constructor-function "Add constructor function")
- [Register method function](https://animejs.com/documentation/scope/register-method-function "Register method function")
- [Parameters](https://animejs.com/documentation/scope/scope-parameters "Scope parameters")
- [Methods](https://animejs.com/documentation/scope/scope-methods "Scope methods")
- [Properties](https://animejs.com/documentation/scope/scope-properties "Scope properties")

**Previous** **Next**

- [Common auto layout gotchas](https://animejs.com/documentation/layout/common-auto-layout-gotchas "Common auto layout gotchas")
- [Add constructor function](https://animejs.com/documentation/scope/add-constructor-function "Add constructor function")