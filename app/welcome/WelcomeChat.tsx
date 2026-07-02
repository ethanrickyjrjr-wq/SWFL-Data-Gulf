import { Separator } from "@/components/ui/separator";

import { ConversationalChat } from "./_components/ConversationalChat";
import { GroundedAnswer } from "./_components/GroundedAnswer";

/**
 * Welcome surface. The ZIP hero is the fast path — a grounded, cited answer that
 * looks as trustworthy as it is (metric cards + per-number citations + freshness
 * badge, revealed split: cards pop, synthesis streams). Below it, the general
 * conversational chat carries the recurring-email hook and the other prompts.
 *
 * `demo` (from ?demo=1) replays a fixture through the real frame contract so the
 * card UI ships and browser-smokes before the grounding fan-out emits {answer}.
 */
export default function WelcomeChat({
  demo = false,
  initialPrompt,
}: {
  demo?: boolean;
  /** Outreach deep-link seed (?prompt=) — auto-asked once by the conversational chat. */
  initialPrompt?: string;
}) {
  return (
    <div className="mt-8 space-y-8">
      <GroundedAnswer demo={demo} />

      <div className="flex items-center gap-3" role="presentation">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wider text-text-tertiary">or ask anything</span>
        <Separator className="flex-1" />
      </div>

      <ConversationalChat initialPrompt={initialPrompt} />
    </div>
  );
}
