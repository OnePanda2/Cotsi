import { useMe } from "../App";

/** Shown while lessons aren't open yet (before launch, when no AI key is set). */
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
