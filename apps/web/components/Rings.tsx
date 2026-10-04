/** 로고 모티프: 동그란 나이테 */
export function Rings({ size = 28, className }: { size?: number; className?: string }) {
  const rings = [46, 37, 28.5, 20.5, 13, 6];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#FCE3EB" />
      {rings.map((r, i) => (
        <ellipse
          key={r}
          cx={50 + (i % 2 ? 0.8 : -0.6)}
          cy={50 + (i % 2 ? -0.5 : 0.7)}
          rx={r}
          ry={r * 0.97}
          fill="none"
          stroke={i % 2 ? '#F4B9CA' : '#4A3355'}
          strokeOpacity={i % 2 ? 1 : 0.55}
          strokeWidth={i === 0 ? 2.4 : 1.8}
        />
      ))}
      <circle cx="50" cy="50" r="2.2" fill="#4A3355" />
    </svg>
  );
}
