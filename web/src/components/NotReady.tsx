import { useMe } from "../App";

/** Shown while lessons aren't open to this learner: before launch (no AI key), or not on the founding-members list. */
export function NotReady() {
  const { me } = useMe();
  if (!me || me.ai?.ready !== false) return null;
  return (
    <div className="notice launching" role="status">
      <span className="pulse" aria-hidden="true" />
      <span>{me.ai.message}</span>
    </div>
  );
}

export function useAiReady(): boolean {
  const { me } = useMe();
  return me?.ai?.ready !== false;
}
