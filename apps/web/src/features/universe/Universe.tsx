import { Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ElementRef } from '../missions/picture';
import { Labels } from './labels/Labels';
import { loadAssets, type LoadedAssets } from './scene/assets';
import { canDrawUniverse, createUniverseScene, type UniverseScene } from './scene/scene';
import type { UniverseProps } from './types';
import { labelDetail, WORLD, type LabelDetail } from './world/world';

/**
 * The Universe: a picture of the Mission in space, drawn by three.js on a canvas with HTML labels
 * over it. The shell creates the scene once, hands it every new picture and selection, and
 * destroys it on unmount; clicks come back through `onSelect`, failures through `onFailure`.
 */
export function Universe({ picture, selection, onSelect, onFailure }: UniverseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<UniverseScene | null>(null);
  const labelElements = useRef(new Map<string, HTMLElement>());
  const [detail, setDetail] = useState<LabelDetail>('far');
  // The scene lives longer than one render: it reads the latest props through this ref.
  const latest = useRef({ picture, selection, onSelect, onFailure });
  useLayoutEffect(() => {
    latest.current = { picture, selection, onSelect, onFailure };
  });

  useEffect(() => {
    const container = containerRef.current;
    const host = canvasHostRef.current;
    if (!container || !host) return;
    if (!canDrawUniverse()) {
      latest.current.onFailure('no-webgl2');
      return;
    }
    // A canvas of its own per scene: its drawing context is given back when the scene goes.
    const canvas = document.createElement('canvas');
    canvas.className = 'block size-full';
    host.append(canvas);
    let scene: UniverseScene | null = null;
    let loaded: LoadedAssets | null = null;
    let disposed = false;
    loadAssets(latest.current.picture.slots.map((slot) => slot.unit)).then(
      (assets) => {
        if (disposed) {
          assets.dispose();
          return;
        }
        loaded = assets;
        scene = createUniverseScene({
          canvas,
          container,
          picture: latest.current.picture,
          selection: latest.current.selection,
          assets,
          labelElement: (key) => labelElements.current.get(key) ?? null,
          onSelect: (next) => latest.current.onSelect(next),
          onZoom: (zoom) => setDetail(labelDetail(zoom)),
          onFailure: (failure) => latest.current.onFailure(failure),
        });
        sceneRef.current = scene;
      },
      (error: unknown) => {
        console.error('The models of the Universe did not load', error);
        if (!disposed) latest.current.onFailure('model-load');
      },
    );
    return () => {
      disposed = true;
      scene?.dispose();
      // The models outlive no scene: they were loaded for this one.
      loaded?.dispose();
      sceneRef.current = null;
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.update(picture, selection);
  }, [picture, selection]);

  const register = useCallback((key: string, element: HTMLElement | null) => {
    if (element) labelElements.current.set(key, element);
    else labelElements.current.delete(key);
  }, []);
  const hover = useCallback((ref: ElementRef | null) => sceneRef.current?.hover(ref), []);

  return (
    <div
      ref={containerRef}
      className="relative size-full overflow-hidden"
      style={{ background: WORLD.spaceCss }}
      data-testid="mission-universe"
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      <Labels
        picture={picture}
        selection={selection}
        detail={detail}
        register={register}
        onSelect={onSelect}
        onHover={hover}
      />
      <button
        type="button"
        onClick={() => sceneRef.current?.fit()}
        aria-label="Fit"
        className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
        style={{
          color: WORLD.labels.text,
          background: WORLD.labels.background,
          borderColor: WORLD.labels.border,
        }}
      >
        <Maximize2 aria-hidden="true" className="size-3.5" /> Fit
      </button>
    </div>
  );
}
