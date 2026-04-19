// 좌우 대칭 2-Actor 배치 (개인회생: client·court, 이혼: client·spouse).

export function DualActorLayout({
  left,
  right,
  caption,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="space-y-1">
      {caption && (
        <div className="text-xs text-zinc-500 text-center italic">{caption}</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {left}
        {right}
      </div>
    </div>
  );
}
