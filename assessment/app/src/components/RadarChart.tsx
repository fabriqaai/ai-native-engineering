"use client";

import type { CapabilityScore } from "@/lib/types";

interface RadarChartProps {
  scores: CapabilityScore[];
  size?: number;
}

export default function RadarChart({ scores, size = 300 }: RadarChartProps) {
  const center = size / 2;
  const radius = size * 0.38;
  const levels = 5;
  const angleStep = (2 * Math.PI) / scores.length;
  const startAngle = -Math.PI / 2;

  function polarToCartesian(angle: number, r: number) {
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  }

  // Grid lines
  const gridPaths = Array.from({ length: levels }, (_, i) => {
    const r = (radius * (i + 1)) / levels;
    const points = scores.map((_, j) => {
      const angle = startAngle + j * angleStep;
      return polarToCartesian(angle, r);
    });
    return (
      points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z"
    );
  });

  // Spoke lines
  const spokes = scores.map((_, i) => {
    const angle = startAngle + i * angleStep;
    const end = polarToCartesian(angle, radius);
    return `M ${center} ${center} L ${end.x} ${end.y}`;
  });

  // Data polygon
  const dataPoints = scores.map((s, i) => {
    const angle = startAngle + i * angleStep;
    const r = (s.score / 100) * radius;
    return polarToCartesian(angle, r);
  });
  const dataPath =
    dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  // Labels
  const labels = scores.map((s, i) => {
    const angle = startAngle + i * angleStep;
    const labelR = radius + 24;
    const pos = polarToCartesian(angle, labelR);
    return { ...pos, label: s.radarLabel, score: s.score };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Grid */}
      {gridPaths.map((d, i) => (
        <path
          key={`grid-${i}`}
          d={d}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}

      {/* Spokes */}
      {spokes.map((d, i) => (
        <path
          key={`spoke-${i}`}
          d={d}
          stroke="var(--color-border)"
          strokeWidth={0.5}
          opacity={0.4}
        />
      ))}

      {/* Data area */}
      <path d={dataPath} fill="var(--color-accent)" opacity={0.15} />
      <path
        d={dataPath}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle
          key={`point-${i}`}
          cx={p.x}
          cy={p.y}
          r={3}
          fill="var(--color-accent)"
        />
      ))}

      {/* Labels */}
      {labels.map((l, i) => (
        <g key={`label-${i}`}>
          <text
            x={l.x}
            y={l.y - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-foreground)"
            fontSize={11}
            fontWeight={500}
          >
            {l.label}
          </text>
          <text
            x={l.x}
            y={l.y + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-muted)"
            fontSize={10}
          >
            {l.score}
          </text>
        </g>
      ))}
    </svg>
  );
}
