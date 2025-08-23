import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level11: Level = {
  id: "level-11",
  name: "Level 11",
  shortName: "11",
  background: bgUrl,
  color: "#00BFFF",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level11;
