import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Scene } from "@/lib/types";

export interface ShortVideoProps extends Record<string, unknown> {
  scenes: Scene[];
  fps?: number;
}

export function ShortVideo({ scenes, fps = 30 }: ShortVideoProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#101814", fontFamily: "Noto Sans CJK SC, sans-serif" }}>
      {scenes.map((scene, index) => {
        const from = scenes.slice(0, index).reduce((sum, previous) => sum + previous.duration * fps, 0);
        const durationInFrames = scene.duration * fps;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneSequence scene={scene} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function SceneSequence({ scene, durationInFrames }: { scene: Scene; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1.03, 1.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(
    frame,
    [0, 8, durationInFrames - 8, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {scene.assetUrl && (
        scene.assetKind === "VIDEO"
          ? <OffthreadVideo src={scene.assetUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
          : <Img src={scene.assetUrl} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(transparent 52%, rgba(0,0,0,.64))" }} />
      <div style={{
        position: "absolute",
        left: 90,
        right: 90,
        bottom: 230,
        color: "white",
        fontSize: 52,
        fontWeight: 700,
        lineHeight: 1.45,
        textAlign: "center",
        textShadow: "0 4px 16px rgba(0,0,0,.85)",
      }}>
        {scene.subtitle}
      </div>
    </AbsoluteFill>
  );
}
