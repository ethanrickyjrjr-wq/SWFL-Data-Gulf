"use client";

import { AnswerBlock } from "./AnswerBlock";
import { useWelcomeStream } from "./useWelcomeStream";
import { ZipHeroInput } from "./ZipHeroInput";

/**
 * The hero grounded-answer experience: ZIP in → echo + cited cards + streamed
 * synthesis. `demo` replays a fixture through the real frame contract so this
 * ships and browser-smokes before the backend grounding lands.
 */
export function GroundedAnswer({ demo }: { demo: boolean }) {
  const { state, send } = useWelcomeStream(demo);
  const busy =
    state.status === "awaiting" || state.status === "answered" || state.status === "streaming";

  return (
    <section>
      <ZipHeroInput onSubmit={(zip) => void send(zip)} busy={busy} />
      <AnswerBlock state={state} />
    </section>
  );
}
