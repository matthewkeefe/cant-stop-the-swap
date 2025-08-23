import type { Level } from "./types";

import bgUrl from "../assets/background/coral-sea.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level2: Level = {
  id: "level-2",
  name: "Level 2",
  shortName: "2",
  background: bgUrl,
  color: "#FF4F81",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.2,
  music: musicUrl,
};

export default level2;
