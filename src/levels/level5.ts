import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level5: Level = {
  id: "level-5",
  name: "Level 5",
  shortName: "5",
  background: bgUrl,
  color: "#1E90FF",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level5;
