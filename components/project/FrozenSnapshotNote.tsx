export function FrozenSnapshotNote({ filedAt }: { filedAt: string }) {
  const [y, mo, dy] = filedAt.slice(0, 10).split("-");
  const d = `${mo}/${dy}/${y}`;
  return (
    <p className="mt-1 text-[11px] text-gray-500 italic">
      This is the file you provided on {d}; we can&apos;t refresh it automatically.
    </p>
  );
}
