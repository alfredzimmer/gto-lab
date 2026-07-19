import type { Metadata } from "next";
import Trainer from "./Trainer";

export const metadata: Metadata = {
  title: "GTO Trainer",
  description:
    "Play heads-up NLHE spots against a Deep CFR–solved strategy and get graded against the equilibrium mix.",
};

export default function TrainerPage() {
  return <Trainer />;
}
