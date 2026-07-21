import type { Metadata } from "next";
import Play from "./Play";

export const metadata: Metadata = {
  title: "Play",
  description:
    "Play continuous heads-up hands against the Deep CFR bot and track your PnL.",
};

export default function PlayPage() {
  return <Play />;
}
