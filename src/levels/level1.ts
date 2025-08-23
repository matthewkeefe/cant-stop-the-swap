import type { Level } from "./types";
import bgUrl from "../assets/background/fantasy-forest.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level1: Level = {
  id: "level-1",
  name: "Level 1",
  shortName: "1",
  background: bgUrl,
  color: "#00FFFF",
  totalLines: 5,
  startingLines: 5,
  targetLines: 5,
  raiseRate: 0.1,
  music: musicUrl,
};

export default level1;
