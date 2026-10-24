import { cn } from '@suptron/ui/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';
import { polarToCartesian, type Point } from '../../lib/geometry';
import { CARD_HEIGHT, CARD_WIDTH, type ClockLayout } from './layout';

export function Ring({ layout }: { layout: ClockLayout }) {
  return (
    <circle
      cx={layout.center.x}
      cy={layout.center.y}
      r={layout.radius}
      className="fill-none stroke-border"
      strokeWidth={2}
      data-clock-background=""
    />
  );
}

export function StartMarker({ layout }: { layout: ClockLayout }) {
  const { x, y } = layout.start.position;
  const label = polarToCartesian(layout.center, layout.radius + 34, 0);
  return (
    <g data-testid="start-marker">
      <circle cx={x} cy={y} r={9} className="fill-primary stroke-background" strokeWidth={3} />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        className="fill-muted-foreground text-[12px] font-semibold uppercase tracking-wider"
      >
        Start
      </text>
    </g>
  );
}

export function CoreCircle({
  layout,
  selected,
  onClick,
  children,
}: {
  layout: ClockLayout;
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const r = Math.min(96, layout.radius * 0.38);
  return (
    <foreignObject
      x={layout.center.x - r}
      y={layout.center.y - r}
      width={r * 2}
      height={r * 2}
      data-testid="core-circle"
    >
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label="Core"
        data-selected={selected ? 'true' : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
        }}
        className={cn(
          'bg-card text-card-foreground flex size-full flex-col items-center justify-center gap-1 rounded-full border-2 text-center shadow-sm',
          onClick && 'cursor-pointer hover:border-primary/60',
          selected ? 'border-primary ring-primary/30 ring-4' : 'border-border',
        )}
      >
        {children ?? <span className="text-sm font-bold uppercase tracking-wider">Core</span>}
      </div>
    </foreignObject>
  );
}

export function ArrowMarkers() {
  return (
    <defs>
      <marker
        id="clock-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
      </marker>
      <marker
        id="clock-arrow-loop"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-warning" />
      </marker>
      <marker
        id="clock-arrow-exit"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-success" />
      </marker>
    </defs>
  );
}

export function ForwardArrows({ layout }: { layout: ClockLayout }) {
  return (
    <g data-testid="forward-arrows">
      {layout.forwardArcs.map((arc) => (
        <path
          key={`${arc.from}-${arc.to}`}
          d={arc.path}
          className="fill-none stroke-muted-foreground"
          strokeWidth={2}
          markerEnd="url(#clock-arrow)"
          data-from={arc.from}
          data-to={arc.to}
        />
      ))}
    </g>
  );
}

export interface LoopChordProps {
  loop: ClockLayout['loops'][number];
  badge?: ReactNode;
  highlighted?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function LoopChord({
  loop,
  badge,
  highlighted,
  onPointerEnter,
  onPointerLeave,
}: LoopChordProps) {
  return (
    <g
      data-testid="loop-chord"
      data-from={loop.from}
      data-to={loop.to}
      data-highlighted={highlighted ? 'true' : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="cursor-default"
    >
      <path d={loop.path} className="fill-none stroke-transparent" strokeWidth={16} />
      <path
        d={loop.path}
        className={cn(
          'fill-none stroke-warning transition-[stroke-width]',
          highlighted ? 'stroke-[4px]' : 'stroke-[2px]',
        )}
        markerEnd="url(#clock-arrow-loop)"
      />
      <foreignObject x={loop.badgeAt.x - 48} y={loop.badgeAt.y - 12} width={96} height={24}>
        <div className="flex justify-center">
          <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
            {badge ?? `max ${loop.limit}`}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

export function ExitArrow({
  exit,
  label,
  highlighted,
}: {
  exit: ClockLayout['exits'][number];
  label: string;
  highlighted?: boolean;
}) {
  return (
    <g
      data-testid="exit-arrow"
      data-slot={exit.slot}
      data-highlighted={highlighted ? 'true' : undefined}
    >
      <path
        d={exit.path}
        className={cn('fill-none stroke-success', highlighted ? 'stroke-[4px]' : 'stroke-[2px]')}
        markerEnd="url(#clock-arrow-exit)"
      />
      <foreignObject x={exit.labelAt.x - 80} y={exit.labelAt.y - 12} width={160} height={40}>
        <div className="flex justify-center">
          <span className="text-success max-w-[160px] truncate text-[11px] font-semibold">
            {label}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

export interface CardShellProps extends HTMLAttributes<HTMLDivElement> {
  position: Point;
  name: string;
  selected?: boolean;
  animate?: boolean;
}

/** The positioned HTML card at a Slot position; content is up to the caller. */
export function CardShell({
  position,
  name,
  selected,
  animate = true,
  className,
  style,
  children,
  ...props
}: CardShellProps) {
  return (
    <div
      data-testid="slot-card"
      data-slot={name}
      data-selected={selected ? 'true' : undefined}
      style={{
        position: 'absolute',
        left: position.x - CARD_WIDTH / 2,
        top: position.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        ...style,
      }}
      className={cn(
        'bg-card text-card-foreground rounded-xl border-2 p-2.5 text-left shadow-sm select-none',
        animate && 'transition-[left,top] duration-300 ease-out',
        selected ? 'border-primary ring-primary/30 ring-4' : 'border-border',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
