// components/email-lab/social/KonvaStage.tsx
"use client";
import { Fragment, useEffect, useRef, type RefObject } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImg, Group, Transformer } from "react-konva";
import type Konva from "konva";
import { SOCIAL_FORMATS } from "@/lib/social/formats";
import { THEMES } from "@/lib/social/design/system";
import { safeInsetPercents, hasChromeSafeZone } from "@/lib/social/safe-zones";
import type { SocialDesign, SocialElement } from "@/lib/social/design/types";
import { useKonvaImage } from "./use-konva-image";

export interface KonvaStageProps {
  design: SocialDesign;
  /** on-screen render width (the design's intrinsic px are scaled to fit this). */
  displayWidth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (el: SocialElement) => void;
  stageRef: RefObject<Konva.Stage | null>;
}

/**
 * The geometry props that ride on EVERY element's OWN top node. `id` + `draggable`
 * live on the SAME node the Transformer targets via `stage.findOne('#id')`, so drag
 * (this node) and resize (Transformer on this node) never fight (Task-6 correction #1).
 * x/y/rotation are state-controlled here so they can't be dropped per element type.
 */
function geomProps(el: SocialElement, onSelect: () => void, onChange: (e: SocialElement) => void) {
  return {
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      // cast: we only override BaseElement geometry, never the discriminant —
      // sound, and it sidesteps the union-spread widening problem.
      onChange({ ...el, x: e.target.x(), y: e.target.y() } as SocialElement),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      // Konva resizes via scale; bake it into width/height and reset scale to 1
      // so the next transform starts from a clean 1:1 node.
      node.scaleX(1);
      node.scaleY(1);
      onChange({
        ...el,
        x: node.x(),
        y: node.y(),
        width: Math.max(20, el.width * scaleX),
        height: Math.max(20, el.height * scaleY),
        rotation: node.rotation(),
      } as SocialElement);
    },
  };
}

/**
 * CORS-safe image/logo node. The hook lives here (always called) so the rules of
 * hooks hold. The placeholder Rect carries the SAME geomProps as the loaded image,
 * so a freshly-added image (src "" → idle) is still selectable/draggable.
 */
function ImageEl({
  el,
  geom,
}: {
  el: Extract<SocialElement, { type: "image" | "logo" | "chart" }>;
  geom: ReturnType<typeof geomProps>;
}) {
  const [img, status] = useKonvaImage("src" in el ? (el.src ?? "") : "");
  if (status !== "loaded" || !img) {
    // The still-loading placeholder. Was a hand-typed #1f2d36 — near the brand's
    // panel color but not it. A placeholder is still a surface; it reads from the
    // root like every other surface does.
    return (
      <Rect
        {...geom}
        width={el.width}
        height={el.height}
        fill={THEMES.dark.panel}
        cornerRadius={6}
      />
    );
  }
  return <KonvaImg {...geom} image={img} width={el.width} height={el.height} />;
}

function renderElement(
  el: SocialElement,
  onSelect: () => void,
  onChange: (e: SocialElement) => void,
) {
  const geom = geomProps(el, onSelect, onChange);
  switch (el.type) {
    case "text":
      return (
        <Text
          {...geom}
          width={el.width}
          text={el.text}
          fontSize={el.fontSize}
          fontFamily={el.fontFamily}
          fontStyle={el.fontStyle ?? "normal"}
          fill={el.fill}
          align={el.align ?? "left"}
        />
      );
    case "cta":
      return (
        <Group {...geom} width={el.width} height={el.height}>
          <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={el.height / 2} />
          <Text
            text={el.text}
            width={el.width}
            height={el.height}
            align="center"
            verticalAlign="middle"
            fontSize={el.fontSize}
            fill={el.textFill}
          />
        </Group>
      );
    case "stat":
      return (
        <Group {...geom} width={el.width} height={el.height}>
          <Text text={el.value} fontSize={el.valueFontSize} fontStyle="bold" fill={el.accent} />
          <Text
            text={el.label}
            y={el.valueFontSize + 8}
            fontSize={el.labelFontSize}
            fill={el.fill}
          />
        </Group>
      );
    case "image":
    case "logo":
      return <ImageEl el={el} geom={geom} />;
    case "chart":
      // Same path as image/logo: a rasterized chart PNG (email-media, CORS-safe)
      // loads via useKonvaImage's crossOrigin="anonymous" so stage.toDataURL()
      // stays untainted. Empty src (still building / dropped by the coherence
      // guard) keeps the grey placeholder — it means "loading", not "broken".
      return <ImageEl el={el} geom={geom} />;
    default:
      return null;
  }
}

export default function KonvaStage({
  design,
  displayWidth,
  selectedId,
  onSelect,
  onChange,
  stageRef,
}: KonvaStageProps) {
  const trRef = useRef<Konva.Transformer | null>(null);
  // intrinsic design size — single source of truth (SOCIAL_FORMATS is resvg-free).
  const dims = SOCIAL_FORMATS[design.format];
  const scale = displayWidth / dims.width;
  const stageW = dims.width * scale;
  const stageH = dims.height * scale;
  // Safe-zone guide geometry. Percentages map straight onto the safe fractions —
  // no scale math needed (CSS resolves top/bottom against height, left/right against
  // width, which is exactly the basis safeInsets uses).
  const safe = safeInsetPercents(design.format);
  const showChromeBands = hasChromeSafeZone(design.format);

  // Attach the Transformer to the selected node (resolved by id — the SAME node that
  // owns `draggable`). Re-runs when the design changes so a moved/added node re-binds.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (!selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = stage.findOne(`#${selectedId}`);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, design, stageRef]);

  return (
    <div style={{ position: "relative", width: stageW, height: stageH }}>
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) onSelect(null); // click empty → deselect
        }}
        onTouchStart={(e) => {
          if (e.target === e.target.getStage()) onSelect(null);
        }}
      >
        <Layer>
          {/* background is non-interactive so a click on it reaches the Stage → deselect */}
          <Rect
            listening={false}
            x={0}
            y={0}
            width={dims.width}
            height={dims.height}
            fill={design.background}
          />
          {design.elements.map((el) => (
            <Fragment key={el.id}>{renderElement(el, () => onSelect(el.id), onChange)}</Fragment>
          ))}
          <Transformer
            ref={trRef}
            rotateEnabled
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 20 || newBox.height < 20 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>
      {/* Safe-zone GUIDE — a DOM overlay, NOT Konva nodes. It sits above the canvas
          but (a) is never captured by stage.toDataURL() on export (that reads only the
          canvas) and (b) has pointer-events:none so it never blocks a drag. A soft aid,
          never a clamp (RULE 0.7). For `story` it shades the platform UI-chrome bands;
          feed formats show only the dashed margin box. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {showChromeBands && (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: safe.top,
                background: "rgba(224,129,88,0.16)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: safe.bottom,
                background: "rgba(224,129,88,0.16)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: safe.top,
                bottom: safe.bottom,
                left: 0,
                width: safe.left,
                background: "rgba(224,129,88,0.10)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: safe.top,
                bottom: safe.bottom,
                right: 0,
                width: safe.right,
                background: "rgba(224,129,88,0.10)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: safe.top,
                left: 8,
                fontSize: 10,
                lineHeight: "12px",
                color: "rgba(255,255,255,0.75)",
                transform: "translateY(-14px)",
              }}
            >
              keep text &amp; logo out of shaded areas
            </div>
          </>
        )}
        <div
          style={{
            position: "absolute",
            top: safe.top,
            bottom: safe.bottom,
            left: safe.left,
            right: safe.right,
            border: "1px dashed rgba(255,255,255,0.45)",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}
