import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level7: Level = {
  id: "level-7",
  name: "Level 7",
  shortName: "7",
  background: bgUrl,
  color: "#40E0D0",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level7;
