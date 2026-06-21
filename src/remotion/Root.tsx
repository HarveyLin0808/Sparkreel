import { Composition } from "remotion";
import { ShortVideo } from "@/remotion/ShortVideo";

export function RemotionRoot() {
  return (
    <Composition
      id="SparkreelShortVideo"
      component={ShortVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={1800}
      defaultProps={{ scenes: [], fps: 30 }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.scenes.reduce((sum, scene) => sum + scene.duration, 0) * 30),
      })}
    />
  );
}
