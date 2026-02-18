import { Composition } from "remotion";
import { DemoComposition } from "./DemoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DemoComposition"
      component={DemoComposition}
      durationInFrames={450}
      fps={30}
      width={800}
      height={500}
    />
  );
};
