import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level3: Level = {
  id: "level-3",
  name: "Level 3",
  background: bgUrl,
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level3;
