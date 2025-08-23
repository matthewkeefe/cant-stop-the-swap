import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level19: Level = {
  id: "level-19",
  name: "Level 19",
  shortName: "19",
  background: bgUrl,
  color: "#FFFF00",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level19;
