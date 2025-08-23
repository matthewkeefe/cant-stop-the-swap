import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level17: Level = {
  id: "level-17",
  name: "Level 17",
  shortName: "17",
  background: bgUrl,
  color: "#00FFFF",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level17;
