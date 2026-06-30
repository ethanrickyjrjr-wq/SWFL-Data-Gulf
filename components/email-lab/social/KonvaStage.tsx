// components/email-lab/social/KonvaStage.tsx
"use client";
import { Fragment, useEffect, useRef, type RefObject } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImg, Group, Transformer } from "react-konva";
import type Konva from "konva";
import { SOCIAL_FORMATS } from "@/lib/social/formats";
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
  el: Extract<SocialElement, { type: "image" | "logo" }>;
  geom: ReturnType<typeof geomProps>;
}) {
  const [img, status] = useKonvaImage(el.src);
  if (status !== "loaded" || !img) {
    return <Rect {...geom} width={el.width} height={el.height} fill="#1f2d36" cornerRadius={6} />;
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
      // v1: a chart with no rasterized image src shows a placeholder; the chart is
      // rendered to an image src in a later task.
      return <Rect {...geom} width={el.width} height={el.height} fill="#1f2d36" cornerRadius={6} />;
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
    <Stage
      ref={stageRef}
      width={dims.width * scale}
      height={dims.height * scale}
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
  );
}
